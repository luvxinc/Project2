# 新旧数据映射 (Data Mapping)

> **本文档定义 MySQL (V1) → PostgreSQL (V2) 的数据迁移映射关系。**

---

## 1. 迁移总览

### 1.1 数据库转换

| 项目 | V1 (老系统) | V2 (新系统) |
|------|-------------|-------------|
| **数据库** | MySQL 8.x | PostgreSQL 16 |
| **ORM** | Django ORM | Prisma |
| **字符集** | utf8mb4 | UTF-8 |
| **主键** | INT AUTO_INCREMENT | UUID |
| **时间戳** | 不统一 | 全表统一 (created_at, updated_at) |

### 1.2 迁移优先级

| 优先级 | 表数量 | 说明 |
|--------|--------|------|
| **P0** | 18 | 核心业务表，必须完整迁移 |
| **P1** | 6 | 重要表，可部分迁移 |
| **P2** | 4 | 辅助表，可不迁移历史 |

---

## 2. 用户与权限

### 2.1 auth_user → User

| V1 字段 | V2 字段 | 类型转换 | 备注 |
|---------|---------|----------|------|
| `id` | `id` | INT → UUID | 生成新 UUID |
| `username` | `username` | VARCHAR → VARCHAR | 直接迁移 |
| `email` | `email` | VARCHAR → VARCHAR | 直接迁移 |
| `password` | `passwordHash` | VARCHAR → VARCHAR | bcrypt 格式兼容 |
| `first_name` + `last_name` | `displayName` | 合并 | 拼接处理 |
| `is_active` | `status` | BOOL → ENUM | true='ACTIVE', false='DISABLED' |
| `is_staff` | `roles[]` | BOOL → ARRAY | 映射到角色数组 |
| `is_superuser` | `roles[]` | BOOL → ARRAY | 添加 'admin' 角色 |
| `date_joined` | `createdAt` | DATETIME → TIMESTAMP | 直接迁移 |
| `last_login` | `lastLoginAt` | DATETIME → TIMESTAMP | 直接迁移 |
| — | `updatedAt` | — | 迁移时设为 now() |

### 2.2 用户权限迁移

**V1 结构** (`user.permissions` JSON 字段):
```json
{
  "module.sales.transactions": ["view", "edit"],
  "module.purchase.*": ["*"]
}
```

**V2 结构** (UserPermission 表):
```sql
-- 拆分为多对多关系
USER_PERMISSIONS (
  user_id UUID,
  module VARCHAR,
  submodule VARCHAR,
  actions TEXT[]  -- PostgreSQL 数组
)
```

**迁移脚本逻辑**:
```python
# 伪代码
for user in v1_users:
    permissions = json.loads(user.permissions or '{}')
    for key, actions in permissions.items():
        parts = key.split('.')
        module = parts[1] if len(parts) > 1 else parts[0]
        submodule = parts[2] if len(parts) > 2 else '*'
        create_permission(user_id, module, submodule, actions)
```

---

## 3. 产品模块

### 3.1 Data_COGS → Product

| V1 字段 | V2 字段 | 类型转换 | 备注 |
|---------|---------|----------|------|
| `id` | — | 废弃 | 使用新 UUID |
| — | `id` | — | 生成 UUID |
| `SKU` | `sku` | VARCHAR → VARCHAR | 直接迁移，添加 UNIQUE 约束 |
| `Name` | `name` | VARCHAR → VARCHAR | 直接迁移 |
| `Category` | `category` | VARCHAR → VARCHAR | 直接迁移 |
| `COGS` | `cogs` | FLOAT → DECIMAL(10,2) | 类型修正 |
| `UPC` | `upc` | VARCHAR → VARCHAR | 直接迁移 |
| — | `status` | — | 默认 'ACTIVE' |
| — | `createdAt` | — | 迁移时设为 now() |
| — | `updatedAt` | — | 迁移时设为 now() |
| — | `deletedAt` | — | NULL (软删除支持) |

---

## 4. 采购模块

### 4.1 in_supplier → Supplier

| V1 字段 | V2 字段 | 类型转换 | 备注 |
|---------|---------|----------|------|
| `id` | — | 废弃 | 使用新 UUID |
| — | `id` | — | 生成 UUID |
| `name` | `name` | VARCHAR → VARCHAR | 直接迁移 |
| `contact` | `contactName` | VARCHAR → VARCHAR | 直接迁移 |
| `phone` | `phone` | VARCHAR → VARCHAR | 直接迁移 |
| `email` | `email` | VARCHAR → VARCHAR | 直接迁移 |
| `address` | `address` | TEXT → TEXT | 直接迁移 |
| `currency` | `defaultCurrency` | VARCHAR → ENUM | 'USD' 或 'RMB' |
| `is_active` | `status` | BOOL → ENUM | 映射 |
| `created_at` | `createdAt` | DATETIME → TIMESTAMP | 直接迁移 |
| — | `updatedAt` | — | 迁移时设为 now() |

### 4.2 in_supplier_strategy → SupplierStrategy

| V1 字段 | V2 字段 | 类型转换 | 备注 |
|---------|---------|----------|------|
| `id` | — | 废弃 | 使用新 UUID |
| `supplier_id` | `supplierId` | INT → UUID | **需要映射表** |
| `product_id` | `productId` | INT → UUID | **需要映射表** |
| `price` | `unitPrice` | FLOAT → DECIMAL(10,4) | 精度提升 |
| `currency` | `currency` | VARCHAR → ENUM | 'USD' 或 'RMB' |
| `exchange_rate` | `exchangeRate` | FLOAT → DECIMAL(10,4) | 精度提升 |
| `effective_date` | `effectiveDate` | DATE → DATE | 直接迁移 |
| `seq` | `sequence` | INT → INT | 直接迁移 |
| `created_at` | `createdAt` | DATETIME → TIMESTAMP | 直接迁移 |

### 4.3 in_po_final → PurchaseOrder

| V1 字段 | V2 字段 | 类型转换 | 备注 |
|---------|---------|----------|------|
| `id` | — | 废弃 | 使用新 UUID |
| `po_number` | `poNumber` | VARCHAR → VARCHAR | 直接迁移，UNIQUE |
| `supplier_id` | `supplierId` | INT → UUID | 需要映射表 |
| `order_date` | `orderDate` | DATE → DATE | 直接迁移 |
| `expected_date` | `expectedDate` | DATE → DATE | 直接迁移 |
| `status` | `status` | VARCHAR → ENUM | 映射状态值 |
| `total_amount` | `totalAmount` | FLOAT → DECIMAL(12,2) | 精度提升 |
| `currency` | `currency` | VARCHAR → ENUM | 'USD' 或 'RMB' |
| `notes` | `notes` | TEXT → TEXT | 直接迁移 |
| `created_at` | `createdAt` | DATETIME → TIMESTAMP | 直接迁移 |
| `updated_at` | `updatedAt` | DATETIME → TIMESTAMP | 直接迁移 |

---

## 5. 库存模块

### 5.1 Data_Inventory → InventorySnapshot

**结构重构**: 列式 → 行式

| V1 结构 | V2 结构 |
|---------|---------|
| 每个日期一列 | 每条记录一行 |
| `SKU, 2025-01-01, 2025-01-02, ...` | `id, productId, snapshotDate, quantity` |

**迁移脚本逻辑**:
```python
# 伪代码 - 列转行
for row in v1_inventory:
    sku = row['SKU']
    product_id = sku_to_uuid_map[sku]
    for col in row.columns:
        if is_date_column(col):
            date = parse_date(col)
            quantity = row[col]
            if quantity is not None and quantity > 0:
                create_snapshot(product_id, date, quantity)
```

**V2 Schema**:
```prisma
model InventorySnapshot {
  id          String   @id @default(uuid())
  productId   String
  product     Product  @relation(fields: [productId], references: [id])
  snapshotDate DateTime @db.Date
  quantity    Int
  createdAt   DateTime @default(now())
  
  @@unique([productId, snapshotDate])
  @@index([snapshotDate])
}
```

### 5.2 in_fifo_layers → FifoLayer

| V1 字段 | V2 字段 | 类型转换 | 备注 |
|---------|---------|----------|------|
| `id` | — | 废弃 | 使用新 UUID |
| `sku` | `productId` | VARCHAR → UUID | 通过 SKU 映射 |
| `layer_type` | `layerType` | VARCHAR → ENUM | 'INIT' 或 'RECEIVE' |
| `original_qty` | `originalQty` | INT → INT | 直接迁移 |
| `remaining_qty` | `remainingQty` | INT → INT | 直接迁移 |
| `unit_cost` | `unitCost` | FLOAT → DECIMAL(10,4) | 精度提升 |
| `receive_id` | `receiveId` | INT → UUID | 需要映射表 |
| `receive_date` | `receiveDate` | DATE → DATE | 直接迁移 |
| `created_at` | `createdAt` | DATETIME → TIMESTAMP | 直接迁移 |

---

## 6. 销售模块

### 6.1 Data_Transaction → SalesTransaction

| V1 字段 | V2 字段 | 类型转换 | 备注 |
|---------|---------|----------|------|
| `id` | — | 废弃 | 使用新 UUID |
| `order_id` | `externalOrderId` | VARCHAR → VARCHAR | 直接迁移 |
| `sku` | `productId` | VARCHAR → UUID | 通过 SKU 映射 |
| `order_date` | `orderDate` | DATE → DATE | 直接迁移 |
| `quantity` | `quantity` | INT → INT | 直接迁移 |
| `unit_price` | `unitPrice` | FLOAT → DECIMAL(10,2) | 精度提升 |
| `total_price` | `totalAmount` | FLOAT → DECIMAL(10,2) | 精度提升 |
| `platform` | `platform` | VARCHAR → ENUM | 'AMAZON', 'EBAY', 'MANUAL' |
| `status` | `status` | VARCHAR → ENUM | 映射状态值 |
| `fifo_synced` | `fifoSynced` | BOOL → BOOL | 直接迁移 |
| `created_at` | `createdAt` | DATETIME → TIMESTAMP | 直接迁移 |

---

## 7. 财务模块

### 7.1 in_finance_po → PoPayment

| V1 字段 | V2 字段 | 类型转换 | 备注 |
|---------|---------|----------|------|
| `id` | — | 废弃 | 使用新 UUID |
| `po_id` | `purchaseOrderId` | INT → UUID | 需要映射表 |
| `amount` | `amount` | FLOAT → DECIMAL(12,2) | 精度提升 |
| `currency` | `currency` | VARCHAR → ENUM | 'USD' 或 'RMB' |
| `payment_date` | `paymentDate` | DATE → DATE | 直接迁移 |
| `payment_method` | `paymentMethod` | VARCHAR → ENUM | 映射 |
| `notes` | `notes` | TEXT → TEXT | 直接迁移 |
| `created_at` | `createdAt` | DATETIME → TIMESTAMP | 直接迁移 |

---

## 8. ID 映射表

迁移过程中需要维护 V1 ID → V2 UUID 的映射关系：

```sql
-- 迁移辅助表 (临时)
CREATE TABLE _migration_id_map (
  table_name VARCHAR(100),
  v1_id INT,
  v2_id UUID,
  migrated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (table_name, v1_id)
);
```

**使用示例**:
```sql
-- 迁移 PO 时查找供应商 UUID
SELECT v2_id FROM _migration_id_map 
WHERE table_name = 'supplier' AND v1_id = 5;
```

---

## 9. 迁移脚本结构

```
ops/migration/
├── 01_export_mysql.py       # 导出 MySQL 数据
├── 02_create_id_map.py      # 创建 ID 映射
├── 03_migrate_users.py      # 迁移用户
├── 04_migrate_products.py   # 迁移产品
├── 05_migrate_suppliers.py  # 迁移供应商
├── 06_migrate_po.py         # 迁移采购订单
├── 07_migrate_inventory.py  # 迁移库存
├── 08_migrate_sales.py      # 迁移销售
├── 09_migrate_finance.py    # 迁移财务
├── 10_verify_migration.py   # 验证迁移
└── utils/
    ├── mysql_client.py
    ├── postgres_client.py
    └── id_mapper.py
```

---

## 10. 验证清单

迁移后必须验证：

| 检查项 | 验证方法 |
|--------|----------|
| 记录数一致 | `SELECT COUNT(*) FROM ...` 对比 |
| 金额合计一致 | `SELECT SUM(amount) FROM ...` 对比 |
| 外键完整性 | 检查所有 FK 引用有效 |
| 唯一约束 | 检查无重复 SKU/PO Number |
| 日期范围 | 检查时间戳合理 |
| 权限完整 | 验证用户权限迁移正确 |

---

*Version: 1.0.0*
*Created: 2026-02-04*
*Last Updated: 2026-02-04*
