---
description: V1 Django → V3 Spring Boot 迁移 — MySQL→PG 数据迁移 + HTMX→React 前端重建
---

# V1 → V3 模块迁移

> **核心原则**: V1 Django 持续运行, 逐模块切到 V3, 数据从 MySQL 迁移到 PG。
> **权威规范**: `core/skills/data.md` + `reference/v1-deep-dive.md`
> **V1 深度分析**: `reference/v1-deep-dive.md` (30+ MySQL 表全景, ETL/FIFO/安全码/权限体系)

---

## V1 Django 模块现状 (真实代码)

V1 位于 `backend/`, 使用 Django + HTMX + MySQL。

### 模块清单 (`backend/apps/`)

| 模块 | 文件数 | 核心功能 | 优先级 |
|------|--------|----------|--------|
| **purchase** | 64 | 供应商管理(Supplier+SupplierStrategy), PO 创建/跟踪/收货, 发货管理, 价格比较 | P1 |
| **finance** | 21 | 付款管理, 预付款, 汇率处理, 对账 | P1 |
| **inventory** | 8 | FIFO 层管理, 库存动态, 低库存告警 | P1 |
| **sales** | 3 | 销售交易查询 (轻量, 数据在 ETL 处理) | P2 |
| **etl** | 8 | eBay 订单 ETL (49KB views.py!), 数据清洗, FIFO 成本分配 | P2 |
| **ebay** | 8 | eBay API 集成 (OAuth, 订单查询) | P2 |
| **reports** | 8 | 报表生成 (库存/财务/销售) | P3 |
| **db_admin** | 3 | 数据库备份, 表清理, 系统维护 | P3 |
| **audit** | 23 | 审计日志 (已迁到 V2, 但 V1 仍在使用) | 跳过(V2已有) |
| **products** | 6 | 产品管理 (已迁到 V2) | 跳过(V2已有) |
| **user_admin** | 12 | 用户管理 (已迁到 V2) | 跳过(V2已有) |
| **locking** | 8 | 记录锁定 (乐观锁/悲观锁) | 集成到 V3 通用层 |
| **ordering** | 7 | 跨表排序 (UI 功能) | 集成到 V3 前端 |
| **visuals** | 8 | 可视化图表 (Dashboard) | 集成到 V3 ECharts |
| **sys_config** | 4 | 系统配置 | 集成到 V3 Spring Config |

### V1 公共层 (`backend/common/`, `backend/core/`)

| 文件/目录 | 功能 | V3 对应 |
|-----------|------|---------|
| `legacy_bridge/models.py` | LegacyUser 映射 (MySQL User_Account 只读) | Spring Security UserDetailsService |
| `templates/` (230 文件) | HTMX 模板 (Django Template + HTMX 交互) | Next.js React 页面 |
| `static/` | CSS/JS/图片 | Next.js public/ |
| `scripts/` (73 文件) | 数据处理/迁移脚本 | Spring Batch / Flyway |

---

## V1 Django Purchase 超深度分析

Purchase 是最复杂的 V1 模块 (64 文件, 50 个 views):

### Django Models (`purchase/models.py`)

```python
class Supplier(models.Model):
    supplier_code = CharField(max_length=2, unique=True)  # 两字母代号
    supplier_name = CharField(max_length=100)
    # → V3: suppliers 表 (UUID PK, 扩展字段)

class SupplierStrategy(models.Model):
    supplier = ForeignKey(Supplier, to_field='supplier_code')
    category = CharField(max_length=1, choices=CATEGORY_CHOICES)   # 'E'汽配, 'A'亚马逊
    type = CharField(max_length=1, choices=TYPE_CHOICES)           # A/B/C
    currency = CharField(max_length=3, choices=CURRENCY_CHOICES)   # RMB/USD
    float_currency = BooleanField(default=False)                   # 汇率浮动
    float_threshold = FloatField(default=0.0)                      # 浮动阈值
    depository = BooleanField(default=False)                       # 是否需要定金
    deposit_par = FloatField(default=0.0)                          # 定金百分比
    status = BooleanField(default=True)
    contract_file = FileField(upload_to=contract_upload_path)
    # → V3: supplier_strategies 表 (FloatField → DECIMAL!)
```

### 关键迁移陷阱

| V1 字段 | Django 类型 | 陷阱 | V3 PG 类型 |
|---------|------------|------|------------|
| `deposit_par` | `FloatField` | **精度丢失**! 0.3 ≠ 0.30000000000000004 | `DECIMAL(5,2)` |
| `float_threshold` | `FloatField` | **精度丢失** | `DECIMAL(5,2)` |
| `category` | `CharField(1)` | 单字母代码不可读 | `VARCHAR(20)` + CHECK |
| `type` | `CharField(1)` | 同上 | `VARCHAR(20)` + CHECK |
| `contract_file` | `FileField` | 文件路径在 MySQL | MinIO/S3 + `VARCHAR(500)` |
| `status` | `BooleanField` | True/False 语义模糊 | `VARCHAR(20)` ACTIVE/INACTIVE |

### Views 分析 (`purchase/views/`, 50 个 HTMX views)

| Views 分类 | 数量 | 对应 V3 API |
|-----------|------|------------|
| 供应商 CRUD | ~8 | `GET/POST/PATCH/DELETE /api/v1/suppliers` |
| 供应商策略 | ~6 | `GET/POST/PATCH /api/v1/suppliers/{id}/strategies` |
| PO 管理 (含明细) | ~15 | `GET/POST/PATCH /api/v1/purchase-orders` |
| 发货/收货 | ~10 | `POST /api/v1/shipments`, `POST /api/v1/receiving` |
| 价格比较 | ~5 | `GET /api/v1/price-comparison` |
| 报表 | ~6 | `GET /api/v1/reports/purchase` |

---

## 数据迁移: MySQL → PostgreSQL

### 迁移脚本框架

```bash
# Step 1: 从 V1 MySQL 导出
mysqldump --no-create-info --complete-insert mgmt in_supplier in_supplier_strategy > v1_purchase_data.sql

# Step 2: 类型转换脚本 (Python)
python scripts/migrate_purchase_data.py

# Step 3: 导入 V3 PG (via Flyway + COPY)
psql -d mgmt_erp -f V10__import_v1_purchase_data.sql
```

### 类型转换清单

```python
# scripts/migrate_purchase_data.py
# 对每一行做精确类型转换:

def convert_supplier_strategy(row):
    return {
        'id': uuid4(),
        'supplier_id': lookup_supplier_uuid(row['supplier_code']),
        'category': {'E': 'AUTO_PARTS', 'A': 'AMAZON'}[row['category']],
        'type': {'A': 'GOODS', 'B': 'DEPENDENCY', 'C': 'CONSUMABLE'}.get(row['type']),
        'currency': row['currency'],  # RMB/USD 保持
        'float_threshold': Decimal(str(row['float_threshold'])),  # Float → Decimal!!
        'deposit_rate': Decimal(str(row['deposit_par'])),          # Float → Decimal!!
        'status': 'ACTIVE' if row['status'] else 'INACTIVE',
        # ...
    }
```

### 数据验证

迁移后必须逐条校验:

```sql
-- 金额校验: V1 MySQL float vs V3 PG decimal
-- 差异超过 0.01 即为错误
SELECT s.supplier_code, v1.deposit_par, v3.deposit_rate,
       ABS(v1.deposit_par - v3.deposit_rate::float) AS diff
FROM v1_supplier_strategy v1
JOIN supplier_strategies v3 ON v3.supplier_code = v1.supplier_code
WHERE ABS(v1.deposit_par - v3.deposit_rate::float) > 0.01;
-- 必须返回 0 行
```

---

## 前端重建: HTMX → React

V1 使用 230 个 Django Template + HTMX。V3 用 React 重写:

| V1 HTMX 模板 | V3 React 页面 | 模板 |
|-------------|---------------|------|
| 供应商列表 | `/purchase/suppliers` | DataTable |
| 供应商详情 | `/purchase/suppliers/[id]` | 详情页 |
| PO 列表 | `/purchase/orders` | DataTable |
| PO 详情 (含明细行) | `/purchase/orders/[id]` | 详情页 + 子表 |
| 发货管理 | `/purchase/shipments` | DataTable + 表单 |
| 收货检验 | `/purchase/receiving` | 表单 + 步骤向导 |
| 价格比较 | `/purchase/price-compare` | EnterpriseGrid (AG Grid) |
| 采购报表 | `/purchase/reports` | ECharts + EnterpriseGrid |

---

## 迁移步骤 (每个 V1 模块)

```
1. 分析 V1 Django  models.py / views/ / urls.py / templates/
2. 设计 V3 PG Schema (Flyway 迁移文件) → 参考 build/flyway.md
3. 编写数据迁移脚本 (MySQL → PG, 类型修复)
4. 创建 V3 Kotlin Domain Model + UseCase + Controller
5. 创建 V3 React 前端页面
6. 数据验证 (逐条 V1 vs V3 对比)
7. V1 该模块 → 只读模式 (禁止新增/修改)
8. 全量切 V3
9. 14 天冷却期
10. 关停 V1 该模块
```

---

## 禁止事项

- ❌ 禁止一次性迁移所有模块 (一个一个来)
- ❌ 禁止直接用 MySQL 的 FLOAT 值写入 PG DECIMAL (必须 str → Decimal 转换)
- ❌ 禁止在数据验证通过前关停 V1 模块
- ❌ 禁止删除 V1 Django 代码 (冷却期结束前)
- ❌ 禁止跳过 HTMX 模板分析 (它定义了用户真正需要的交互)
