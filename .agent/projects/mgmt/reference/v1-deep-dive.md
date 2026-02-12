---
description: V1 Django 深度解析 — 迁移到 V3 的权威参考文档
---

# V1 Django 深度解析 (Deep Dive)

> **目的**: 提供 V1 系统的全面技术分析，供 V3 Spring Boot 迁移时精确对标。
> **关键发现**: V1 **不使用 Django ORM** 做核心数据操作——它通过 `DBClient` (SQLAlchemy raw SQL) + `Pandas DataFrame` 直接操作 MySQL 表。

---

## 1. 总体架构

```
V1 Architecture
├── Django Framework (仅用于: 路由/模板/认证/中间件)
├── SQLAlchemy Engine (DBClient) ← 核心数据层, RAW SQL
├── MySQL 数据库 (30+ 表)
├── HTMX + Jinja2 模板 (前端)
├── Services Layer (核心业务逻辑)
│   ├── ETL Pipeline (Ingest → Parse → Transform)
│   ├── FIFO Engine (库存成本追踪)
│   ├── Security Policy Manager (L0-L4)
│   ├── Auth Service (用户/权限管理)
│   └── Financial Analyzers (利润/报表)
└── File-based Config (JSON 安全策略, CSV 纠错记忆库)
```

### 1.1 技术栈

| Layer          | V1 Technology                      | V3 Target               |
|:---------------|:-----------------------------------|:-------------------------|
| Framework      | Django 4.x                         | Spring Boot 3            |
| Language       | Python 3.12                        | Kotlin (JVM)             |
| Database       | MySQL 8 via SQLAlchemy raw SQL     | PostgreSQL via JPA/JOOQ  |
| Frontend       | HTMX + Django Templates            | Next.js + React          |
| Auth           | Custom `AuthService` (MySQL-based) | Spring Security + JWT    |
| Security Codes | L0-L4 via env vars + JSON config   | Vault + Spring Security  |
| Logging        | File-based + MySQL `AuditLog`      | SLF4J + Loki + OTel      |
| Cache          | Django Cache (file-based)          | Redis                   |
| ETL            | Pandas + raw SQL                   | Spring Batch / Kafka     |

### 1.2 路由架构

```
Root Router (django_config/urls.py)
├── /admin/                    → Django Admin
├── /api/health/               → 心跳
├── /api/sys/                  → System Config
├── /api/lock/                 → Locking Service
├── /log/                      → Log System V2.0
├── /ebay/                     → eBay Integration
├── /i18n/                     → 语言切换
└── / (web_ui/urls.py)
    ├── /                      → Dashboard Home
    ├── /login/                → Login
    ├── /logout/               → Logout
    ├── /dashboard/sales/      → Sales Module
    ├── /dashboard/purchase/   → Purchase Module (最复杂)
    ├── /dashboard/inventory/  → Inventory Module
    ├── /dashboard/finance/    → Finance Module
    ├── /dashboard/products/   → Products Module
    ├── /dashboard/user_admin/ → User Admin
    ├── /dashboard/audit/      → Audit Logs
    ├── /dashboard/db_admin/   → Database Admin
    └── /api/sys/*             → System APIs
```

---

## 2. MySQL 数据库表总览

### 2.1 核心业务表 (24 个 `in_` 系列)

V1 使用 **明细/终态** 双表模式: 每次修改在明细表插入新版本行(seq: L01, L02...)，终态表保存当前有效聚合值。

#### 采购管理 (Supplier + PO)

| 表名                  | 用途            | 关键字段                                                        |
|:---------------------|:----------------|:---------------------------------------------------------------|
| `in_supplier`        | 供应商主表       | `supplier_code` (2位字母,UNIQUE), `supplier_name`              |
| `in_supplier_strategy` | 供应商策略表   | FK→`supplier_code`, `category`(E/A), `type`(A/B/C), `currency`(RMB/USD), `float_currency`, `float_threshold`, `depository`, `deposit_par`, `effective_date`, `contract_file` |
| `in_po`              | 采购订单明细表   | `po_num` (格式: `XX20241228-S01`), `po_sku`, `po_quantity`, `po_price`, `seq`(L01,L02..) |
| `in_po_final`        | 采购订单终态表   | `po_num`, `po_sku`, `po_quantity`, `po_price` (当前有效聚合)   |
| `in_po_strategy`     | 订单策略快照表   | `po_num`, `category`, `currency`, `exchange_rate`, `note`      |

#### 发货管理 (Send/Shipment)

| 表名                  | 用途            | 关键字段                                                        |
|:---------------------|:----------------|:---------------------------------------------------------------|
| `in_send`            | 发货单明细表     | `logistic_num`, `po_num`, `date_sent`, `price_kg`, `total_weight`, `pallets`, `usd_rmb`, `total_price`, `seq` |
| `in_send_final`      | 发货单终态表     | `logistic_num`, `po_num`, `po_sku`, `sent_quantity`            |
| `in_send_list`       | 发货清单表       | `logistic_num`, `po_num`, `po_sku`, `sent_quantity`, `po_price`|

#### 入库管理 (Receive)

| 表名                  | 用途            | 关键字段                                                        |
|:---------------------|:----------------|:---------------------------------------------------------------|
| `in_receive`         | 入库明细表       | `logistic_num`, `po_num`, `po_sku`, `receive_quantity`, `receive_date`, `seq` |
| `in_receive_final`   | 入库终态表       | `logistic_num`, `po_num`, `po_sku`, `receive_quantity`, `sent_quantity` |

#### 入库异常 (Diff/Abnormal)

| 表名                  | 用途            | 关键字段                                                        |
|:---------------------|:----------------|:---------------------------------------------------------------|
| `in_diff`            | 差异明细表       | `logistic_num`, `po_num`, `po_sku`, `diff_quantity`, `diff_type`(more/less), `note`, `seq` |
| `in_diff_final`      | 差异终态表       | `logistic_num`, `po_num`, `po_sku`, `status`(pending/done), `receive_date` |

#### 付款管理 (Payment)

| 表名                      | 用途          | 关键字段                                                     |
|:--------------------------|:-------------|:------------------------------------------------------------|
| `in_pmt_logistic`         | 物流付款明细  | `logistic_num`, `amount`, `currency`, `note`, `seq`         |
| `in_pmt_logistic_final`   | 物流付款终态  | `logistic_num`, 付款状态聚合                                |
| `in_pmt_deposit`          | 定金付款明细  | `po_num`, `deposit_amount`, `note`, `seq`                   |
| `in_pmt_deposit_final`    | 定金付款终态  | `po_num`, 定金状态聚合                                      |
| `in_pmt_po`               | 订单付款明细  | `po_num`, `amount`, `note`, `seq`                           |
| `in_pmt_po_final`         | 订单付款终态  | `po_num`, 付款状态聚合                                      |
| `in_pmt_prepay`           | 预付款明细    | `supplier_code`, `amount`, `note`, `seq`                    |
| `in_pmt_prepay_final`     | 预付款终态    | `supplier_code`, 预付款状态聚合                              |

#### FIFO 动态库存 (4表)

| 表名                         | 用途          | 关键字段                                                   |
|:-----------------------------|:-------------|:----------------------------------------------------------|
| `in_dynamic_tran`            | FIFO 交易日志 | `sku`, `qty`, `direction`(IN/OUT), `ref_key`, `order_date`|
| `in_dynamic_fifo_layers`     | FIFO 库存层   | `sku`, `po_num`, `unit_cost`, `qty_original`, `qty_remaining` |
| `in_dynamic_fifo_alloc`      | FIFO 分配记录 | `sku`, `layer_id`, `qty_allocated`, `ref_key`             |
| `in_dynamic_landed_price`    | FIFO 完整成本 | `sku`, `po_num`, `landed_price_usd` (含物流分摊)          |

### 2.2 销售数据表 (非 `in_` 系列)

| 表名                | 用途                 | 关键字段                                                      |
|:--------------------|:--------------------|:-------------------------------------------------------------|
| `Data_Transaction`  | 原始交易数据 (RAW)   | `Order number`, `Transaction creation date`, `Custom label`, `P_SKU1`~`P_SKU10`, `P_Quantity1`~`P_Quantity10`, `P_Flag`, `Processed_T`, `_row_hash` |
| `Data_Order_Earning`| 原始收入数据 (RAW)   | `Order number`, `Item title`, `Item total`, 邮费等字段, `_key_hash` |
| `Data_Clean_Log`    | 清洗后交易数据       | `order date`, `sku1`, `quantity`, `revenue`, `action`(Order/Refund/Cancel等), `seller` |
| `Data_COGS`         | SKU 档案/成本表      | `SKU`, `Category`, `SubCategory`, `Type`, `Cog`(成本), `FreightCost`, `Weight`, `MOQ` |
| `Data_Inventory`    | 库存快照表 (宽表!)   | `SKU`, 以日期为列名(如`2025-01-15`), 每列存该日库存量       |

### 2.3 系统表

| 表名                  | 用途              | 关键字段                                          |
|:---------------------|:------------------|:-------------------------------------------------|
| `User_Account`       | 用户账户表         | `username`, `password_hash`, `is_admin`, `is_locked`, `session_token`, `failed_attempts` |
| `User_Permission`    | 用户权限表         | `username`, `perm_key`, `perm_value`(bool)       |
| `User_Login_History` | 登录历史           | `username`, `ip_address`, `login_time`           |
| `System_Locks`       | 系统锁表           | `lock_key`, `locked_by`, `locked_at`             |
| `AuditLog`           | 审计日志数据库表    | `ref_id`, `actor`, `action`, `target_model`, `changes`, `status` |

---

## 3. 核心服务层 (Service Layer)

### 3.1 DBClient — 数据库抽象层

```
backend/core/components/db/client.py
```

- **技术**: SQLAlchemy `create_engine()` + raw SQL via `text()`
- **读**: `DBClient.read_df(sql)` → `pd.DataFrame`
- **写**: `DBClient.execute_stmt(sql, params)` → `bool` (集成了 Copy-On-Write 快照 + 审计日志)
- **事务**: `DBClient.atomic_transaction()` → `contextmanager` (SQLAlchemy begin)
- **V3迁移**: 替换为 Spring Data JPA Repository 或 JOOQ；DataFrame 操作替换为 Kotlin data class 集合

### 3.2 ETL Pipeline (核心数据流)

```
数据流: CSV Upload → Ingest → Parse → Transform → Clean_Log → FIFO Sync
```

| Stage        | 文件                                     | 功能                                                            |
|:-------------|:-----------------------------------------|:---------------------------------------------------------------|
| **Ingest**   | `core/services/etl/ingest.py`           | CSV 文件读取 + 智能 Seller/Header 检测 + 去重(_row_hash) + 写入 Data_Transaction/Data_Order_Earning |
| **Parse**    | `core/services/etl/parser.py`           | 正则解析 Custom Label → P_SKU1~10/P_Quantity1~10, 3阶段: 向量化→复杂行→校验+自动修复 |
| **Transform**| `core/services/etl/transformer.py`      | Raw→Clean: Action 分类(Order/Refund/Cancel), Fee 摊分, 日期归一化 → 写入 Data_Clean_Log |
| **FIFO Sync**| `core/services/fifo/sales_sync.py`      | Clean_Log → FIFO 出库/回库, 幂等性(ref_key), 支持 RE/CR/CC 部分回库比例 |

**V3迁移策略**: ETL pipeline → Spring Batch Job + Kafka 事件流; FIFO → 独立领域服务

### 3.3 Financial Services (利润分析)

```
core/services/finance/
├── base.py           # ProfitAnalyzerBase — 加载成本/费用/清洗数据
├── profit_sku.py     # 按 SKU 维度利润分析
├── profit_listing.py # 按 Listing (Item ID) 维度
├── profit_combo.py   # 按 Combo (Full SKU) 维度
└── sales.py          # 销售汇总
```

- 成本来源优先级: `in_dynamic_landed_price` > `in_dynamic_fifo_layers` > `Data_COGS`
- 费用累加: 运费/退款运费/eBay税/卖家税 等 10+ 个字段
- 报告输出: CSV + HTML 多表格文件

### 3.4 Prediction & Ordering (智能决策)

| Service          | 文件                              | 功能                                                          |
|:-----------------|:----------------------------------|:-------------------------------------------------------------|
| **Prediction**   | `core/services/prediction.py`     | 分层销量预测: 新品/间歇性(Croston)/低销量(WMA)/高销量(趋势+季节性) |
| **Ordering**     | `core/services/ordering.py`       | 智能补货: ABC分类 + 安全库存 + MOQ约束 + 紧急度评分           |
| **Inventory Snapshot** | `core/services/inventory_snapshot.py` | 库存价值快照: FIFO价值 + 下订/在途量                  |
| **Visual**       | `core/services/visual_service.py` | 图表数据聚合: 按日/周/月粒度                                  |

### 3.5 Correction Service (SKU 纠错)

```
core/services/correction.py
```

- **记忆库**: CSV文件 (`sku_correction_memory.csv`): 记录 `CustomLabel→BadSKU→CorrectSKU` 映射
- **自动修复**: Parser 阶段自动查找记忆库
- **模糊推荐**: `difflib.get_close_matches()` 基于 Levenshtein 距离
- **V3迁移**: PostgreSQL 表 + 内存缓存替代 CSV; 纠错 API 化

---

## 4. 安全架构

### 4.1 认证 (AuthService)

```
core/services/auth/service.py
```

- `User_Account` 表存储: username, password_hash (bcrypt), is_admin, session_token
- `authenticate()`: 验证密码 → 刷新 session_token → 记录登录事件
- `verify_session_token()`: Cookie 中的 token 与数据库对比
- `get_permissions()`: 从 `User_Permission` 表读取, 支持**父权限推断** (child implies parent)
- **V3迁移**: Spring Security + JWT + Redis session

### 4.2 安全码矩阵 (SecurityPolicyManager)

```
core/services/security/policy_manager.py
```

**5级安全码体系:**

| Level | Token Type | 验证方式           | 用途             |
|:------|:-----------|:-------------------|:----------------|
| L0    | `user`     | 当前用户密码        | 次要操作确认     |
| L1    | `query`    | 环境变量 SEC_CODE_QUERY  | 查询敏感数据   |
| L2    | `modify`   | 环境变量 SEC_CODE_MODIFY | 数据修改       |
| L3    | `db`       | 环境变量 SEC_CODE_DB     | 数据库管理操作 |
| L4    | `system`   | 环境变量 SEC_CODE_SYSTEM | 最高级系统操作 |

- 每个业务动作(action_key)在 `action_registry.json` 中配置需要哪些安全码
- 支持 `security_overrides.json` 热更新覆盖(文件mtime检测)
- **V3迁移**: Spring Security AOP + Vault 密钥管理

### 4.3 权限模型

```
层级结构: module.{module}.{submodule}.{action}
示例: module.purchase.supplier.add
      module.purchase.po.mgmt
      module.etl.trans
```

- **推断规则**: 拥有 `module.purchase.supplier.add` 自动推断拥有 `module.purchase.supplier` 和 `module.purchase`
- **不反向推断**: 拥有 `module.purchase` 不意味着拥有所有子权限
- **V3迁移**: Spring Security `@PreAuthorize` + RBAC

---

## 5. 模块详解

### 5.1 Purchase Module (最复杂 — 197行路由, 108个API)

**采购生命周期**: 供应商 → 策略 → 新建PO → 管理PO → 新建发货单 → 管理发货 → 入库 → 入库管理 → 异常处理

**子模块结构**:

```
purchase/views/
├── hub.py           # Hub 页面 (9张卡片)
├── supplier.py      # 供应商: 新增/列表/策略修改/合同查看
├── po_create/       # PO创建向导 (5步验证流程)
│   ├── page.py      # 页面渲染
│   ├── query.py     # 供应商/策略/汇率查询
│   ├── validation.py# 参数/商品验证
│   ├── submit.py    # 提交PO (in_po + in_po_final + in_po_strategy)
│   └── template.py  # Excel 模板生成/解析
├── po_mgmt/         # PO管理 (列表/详情/编辑/删除/恢复/发票)
├── send_create/     # 发货单创建向导
├── send_mgmt/       # 发货管理 (含货物明细编辑)
├── receive/         # 入库操作 (待发货列表 → 提交入库)
├── receive_mgmt/    # 入库管理
└── abnormal.py      # 异常处理 (4种策略: 仅修正/同步修正/延迟入库/厂商错误)
```

**订单号格式**: `XX20241228-S01` (厂商代码 + 日期 + 序号)

**异常处理4策略** (abnormal_process_api):
1. **仅修正发货单**: 只调整 in_send_final/in_send_list
2. **同步修正**: 发货单 + 订单一起调整
3. **延迟入库**: 新建 `{logistic}_delay_V##` 子发货单
4. **厂商错误**: 多收以0价入库 / 少收以原价处理

### 5.2 Sales Module (ETL + Finance)

**数据流**:
1. eBay CSV Upload → `Data_Transaction` + `Data_Order_Earning`
2. Parser → 提取 SKU/数量 (P_SKU1~10, P_Quantity1~10)
3. Transformer → `Data_Clean_Log` (标准化: action/date/费用)
4. FIFO Sync → 库存层级更新
5. Profit Analysis → CSV/HTML 报告

**Action 分类**:
- `Order`: 正常出货 → FIFO 出库
- `Refund (RE)`: 退货 → FIFO 回库 60%
- `Cancel (CR)`: 取消 → FIFO 回库 50%
- `Credit (CC)`: 信用 → FIFO 回库 30%
- `Return (CA)`: 完全退货 → FIFO 100% 还原

### 5.3 Inventory Module

**特殊数据结构**: `Data_Inventory` 是**宽表** — 每个日期是一个列名:

```sql
-- Data_Inventory 表结构示例:
| SKU     | 2025-01-15 | 2025-02-15 | 2025-03-15 |
|---------|------------|------------|------------|
| AB-101  | 100        | 85         | 92         |
```

- 新增盘存 = ALTER TABLE ADD COLUMN (日期列名)
- 删除盘存 = ALTER TABLE DROP COLUMN
- **V3迁移**: 必须改为行式存储 (sku + date + quantity)

**子页面**:
- `/inventory/upload/` — 手动上传盘存 CSV
- `/inventory/edit/` — 库存修改向导 (单点修改/整列删除)
- `/inventory/dynamic_inv/` — 动态库存 (FIFO 实时状态)
- `/inventory/shelf/` — 货架管理
- `/inventory/shelf_pdf/` — 货架 PDF 打印

### 5.4 Finance Module

**子模块结构**:

```
finance/views/
├── __init__.py     # Finance Hub 页面
├── po/             # PO 付款管理
├── deposit/        # 定金管理
├── prepay/         # 预付款管理
├── flow/           # 现金流管理
└── logistic.py     # 物流费用管理
```

- 每个付款类型都有 明细表(`in_pmt_*`) + 终态表(`in_pmt_*_final`)
- 支持批量付款、付款状态过滤、双币显示(RMB+USD)

### 5.5 其他模块

| 模块         | 路径                    | 功能                           |
|:-------------|:-----------------------|:-------------------------------|
| Products     | `apps/products/`       | SKU 档案管理 (Data_COGS)       |
| Reports      | `apps/reports/`        | 报表生成中心 (多格式: CSV/HTML/PDF) |
| Visuals      | `apps/visuals/`        | 图表可视化 (ECharts)           |
| DB Admin     | `apps/db_admin/`       | 数据库备份/恢复/数据清洗        |
| User Admin   | `apps/user_admin/`     | 用户/权限/角色管理              |
| Audit        | `apps/audit/`          | 审计日志查看器                  |
| eBay         | `apps/ebay/`           | eBay OAuth + 订单/财务同步      |
| System Config| `apps/sys_config/`     | 系统配置 API                    |
| Locking      | `apps/locking/`        | 分布式锁服务                    |

---

## 6. V3 迁移关键点

### 6.1 数据模型迁移 (MySQL → PostgreSQL)

| V1 MySQL Pattern              | V3 PostgreSQL Target                  | 注意事项                    |
|:------------------------------|:--------------------------------------|:---------------------------|
| `in_po` + `in_po_final` 双表  | 单表 + `@Version` 乐观锁 + 审计表    | 合并明细/终态为一个实体     |
| `Data_Inventory` 宽表 (列=日期)| `inventory_snapshot` 行表             | 必须改结构, 历史数据需迁移  |
| `Data_Transaction` TEXT 字段  | 强类型 (DECIMAL, TIMESTAMP, ENUM)     | "类型擦除陷阱" 需注意      |
| `Data_COGS` 成本表            | `product` + `product_cost` 分离       | 拆分主数据和成本数据        |
| `_row_hash` 去重              | UNIQUE 约束 + ON CONFLICT             | 利用 PG 原生去重            |

### 6.2 关键业务逻辑迁移

| V1 Logic                    | 迁移复杂度 | 策略                                     |
|:-----------------------------|:----------|:-----------------------------------------|
| ETL Pipeline                 | **高**    | Spring Batch Job, 保持 4阶段不变         |
| FIFO Engine                  | **高**    | 独立 Domain Service, 保持幂等性          |
| 异常处理4策略                 | **高**    | 1:1 迁移到 Kotlin, 事务边界需重新设计    |
| 安全码矩阵                   | **中**    | AOP + Vault, 保持 action_key 体系        |
| 权限推断                     | **中**    | Spring Security Authority 自定义 Voter   |
| 订单号生成 (XX+日期+序号)     | **低**    | 直接 Kotlin 函数                         |
| CSV 记忆库 (纠错)             | **低**    | PostgreSQL 表替代                        |
| DataManager (库存修改)        | **低**    | 标准 JPA Repository                      |
| 数据库备份/恢复               | **低**    | pg_dump/pg_restore + K8s CronJob         |

### 6.3 数据迁移执行顺序

```
Phase 1: Schema (DDL)
  └─ Flyway migration scripts: MySQL types → PostgreSQL types

Phase 2: 静态数据 (先迁移不依赖外键的)
  ├─ Data_COGS → products
  ├─ in_supplier → suppliers
  └─ User_Account/Permission → users/roles

Phase 3: 采购链数据 (按依赖顺序)
  ├─ in_supplier_strategy → supplier_strategies
  ├─ in_po/final → purchase_orders
  ├─ in_send/final → shipments
  ├─ in_receive/final → receives
  └─ in_diff/final → receive_diffs

Phase 4: 财务数据
  └─ in_pmt_* → payments (统一付款表)

Phase 5: FIFO + 交易数据
  ├─ Data_Transaction → raw_transactions
  ├─ Data_Clean_Log → cleaned_transactions
  ├─ Data_Inventory → inventory_snapshots (宽表→行表!)
  └─ in_dynamic_* → fifo_* (4表保持)

Phase 6: 次要数据
  ├─ Data_Order_Earning → order_earnings
  └─ AuditLog → audit_logs
```

---

## 7. 文件引用快速导航

### 核心服务
- `backend/core/components/db/client.py` — DBClient (SQLAlchemy)
- `backend/core/services/auth/service.py` — AuthService
- `backend/core/services/security/policy_manager.py` — 安全码矩阵
- `backend/core/services/database_service.py` — 备份/恢复 + CORE_TABLES 列表

### ETL
- `backend/core/services/etl/ingest.py` — CSV 摄入
- `backend/core/services/etl/parser.py` — SKU 解析
- `backend/core/services/etl/transformer.py` — 数据转换
- `backend/core/services/fifo/sales_sync.py` — FIFO 同步

### 采购
- `backend/apps/purchase/views/` — 所有采购视图
- `backend/apps/purchase/models.py` — Supplier/SupplierStrategy Django Model
- `backend/apps/purchase/urls.py` — 197行路由 (完整 API 清单)

### 财务
- `backend/core/services/finance/base.py` — 利润分析基类
- `backend/apps/finance/views/` — 财务视图

### 库存
- `backend/core/services/inventory/repository.py` — 库存仓库 (FIFO/宽表)
- `backend/apps/inventory/views/dynamic_inv.py` — 动态库存
