# 数据库迁移方案

## 迁移策略

### 方案选择: 全量迁移 + Schema 优化

| 阶段 | 操作 | 说明 |
|------|------|------|
| Step 1 | 设计新 Schema | PostgreSQL + Prisma |
| Step 2 | 编写迁移脚本 | Python/TypeScript |
| Step 3 | 测试迁移 | 开发环境验证 |
| Step 4 | 生产迁移 | 停机切换 |

---

## 新 Schema 设计原则

### 1. 命名规范
```
表名: snake_case 复数 (products, orders, suppliers)
列名: snake_case (created_at, order_id)
主键: id (自增或 UUID)
外键: {table}_id (supplier_id, order_id)
```

### 2. 通用字段
每个表必须包含:
```sql
id          SERIAL PRIMARY KEY,
created_at  TIMESTAMP DEFAULT NOW(),
updated_at  TIMESTAMP DEFAULT NOW(),
deleted_at  TIMESTAMP NULL  -- 软删除
```

### 3. 索引策略
- 主键自动索引
- 外键创建索引
- 常用筛选字段创建索引 (status, date, sku)

---

## 核心表重设计

### 产品表 (products)
```sql
CREATE TABLE products (
    id          SERIAL PRIMARY KEY,
    sku         VARCHAR(50) UNIQUE NOT NULL,
    name        VARCHAR(200),
    category    VARCHAR(100),
    sub_category VARCHAR(100),
    type        VARCHAR(50),
    cogs        DECIMAL(10,2) DEFAULT 0,
    shipping    DECIMAL(10,2) DEFAULT 0,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),
    deleted_at  TIMESTAMP NULL
);
```

### 库存快照表 (inventory_snapshots)
```sql
-- 从列式改为行式
CREATE TABLE inventory_snapshots (
    id          SERIAL PRIMARY KEY,
    sku         VARCHAR(50) NOT NULL,
    snapshot_date DATE NOT NULL,
    quantity    INTEGER NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(sku, snapshot_date)
);

CREATE INDEX idx_inv_sku ON inventory_snapshots(sku);
CREATE INDEX idx_inv_date ON inventory_snapshots(snapshot_date);
```

### FIFO 层表 (fifo_layers)
```sql
CREATE TABLE fifo_layers (
    id              SERIAL PRIMARY KEY,
    sku             VARCHAR(50) NOT NULL,
    layer_type      VARCHAR(10) NOT NULL, -- INIT, IN, OUT
    layer_date      DATE NOT NULL,
    initial_qty     INTEGER NOT NULL,
    remaining_qty   INTEGER NOT NULL,
    unit_cost       DECIMAL(10,4) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'USD',
    source_ref      VARCHAR(100), -- 来源单号
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_fifo_sku ON fifo_layers(sku);
CREATE INDEX idx_fifo_type ON fifo_layers(layer_type);
```

### 供应商表 (suppliers)
```sql
CREATE TABLE suppliers (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(20) UNIQUE NOT NULL,
    name        VARCHAR(200) NOT NULL,
    contact     VARCHAR(100),
    phone       VARCHAR(50),
    address     TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW(),
    deleted_at  TIMESTAMP NULL
);
```

### 采购订单表 (purchase_orders)
```sql
CREATE TABLE purchase_orders (
    id              SERIAL PRIMARY KEY,
    po_number       VARCHAR(50) UNIQUE NOT NULL,
    supplier_id     INTEGER REFERENCES suppliers(id),
    status          VARCHAR(20) DEFAULT 'draft',
    order_date      DATE NOT NULL,
    total_amount    DECIMAL(12,2),
    currency        VARCHAR(3) DEFAULT 'CNY',
    exchange_rate   DECIMAL(10,4),
    deposit_amount  DECIMAL(12,2) DEFAULT 0,
    deposit_paid    BOOLEAN DEFAULT FALSE,
    fully_paid      BOOLEAN DEFAULT FALSE,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    deleted_at      TIMESTAMP NULL
);

CREATE TABLE purchase_order_items (
    id              SERIAL PRIMARY KEY,
    po_id           INTEGER REFERENCES purchase_orders(id),
    sku             VARCHAR(50) NOT NULL,
    quantity        INTEGER NOT NULL,
    unit_price      DECIMAL(10,4) NOT NULL,
    line_total      DECIMAL(12,2) NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

---

## 数据映射

| 老表 | 新表 | 映射说明 |
|------|------|----------|
| `Data_COGS` | `products` | 1:1 直接映射 |
| `Data_Inventory` | `inventory_snapshots` | 列转行 |
| `in_fifo_layers` | `fifo_layers` | 字段重命名 |
| `in_supplier` | `suppliers` | 字段重命名 |
| `in_po_input` + `in_po_final` | `purchase_orders` | 合并简化 |
| `in_po_input_items` | `purchase_order_items` | 1:1 |

详见: [data_mapping.md](./data_mapping.md)

---

## 迁移脚本框架

```typescript
// scripts/migrate.ts

import { PrismaClient } from '@prisma/client';
import mysql from 'mysql2/promise';

async function main() {
    // 1. 连接老数据库
    const oldDb = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        database: 'MGMT'
    });

    // 2. 连接新数据库
    const prisma = new PrismaClient();

    // 3. 迁移产品表
    console.log('Migrating products...');
    const [products] = await oldDb.query('SELECT * FROM Data_COGS');
    for (const p of products) {
        await prisma.product.create({
            data: {
                sku: p.SKU,
                name: p.ProductName,
                category: p.Category,
                // ...
            }
        });
    }

    // 4. 迁移其他表...
}

main();
```

---

## 迁移验证

| 验证项 | 方法 |
|--------|------|
| 记录数一致 | `SELECT COUNT(*) FROM old_table` vs `SELECT COUNT(*) FROM new_table` |
| 金额校验 | `SUM(amount)` 对比 |
| 外键完整性 | `SELECT * FROM orders WHERE supplier_id NOT IN (SELECT id FROM suppliers)` |
| 样本抽查 | 随机抽取 10 条记录对比 |

---

*Last Updated: 2026-02-04*
