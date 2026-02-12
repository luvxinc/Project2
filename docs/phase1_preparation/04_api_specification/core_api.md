# 核心业务 API 规范 (Core API Specification)

> **本文档定义 MGMT V2 系统各业务模块的 RESTful API 契约。**

---

## 1. API 总览

### 1.1 模块端点前缀

| 模块 | 端点前缀 | 优先级 |
|------|----------|--------|
| 产品管理 | `/api/v1/products` | P1 |
| 采购管理 | `/api/v1/purchase` | P0 |
| 库存管理 | `/api/v1/inventory` | P0 |
| 销售管理 | `/api/v1/sales` | P0 |
| 财务管理 | `/api/v1/finance` | P0 |
| 用户管理 | `/api/v1/users` | P0 |
| 数据库运维 | `/api/v1/db-admin` | P1 |
| 审计日志 | `/api/v1/audit` | P1 |

### 1.2 通用约定

参考 [design_principles.md](./design_principles.md)

---

## 2. 产品管理 (Products)

### 2.1 端点清单

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/products` | 产品列表 | P0 |
| GET | `/products/:id` | 产品详情 | P0 |
| POST | `/products` | 创建产品 | P0 |
| PATCH | `/products/:id` | 更新产品 | P0 |
| DELETE | `/products/:id` | 删除产品 (软删除) | P1 |
| GET | `/products/:id/barcode` | 获取条形码 | P1 |
| POST | `/products/:id/barcode/generate` | 生成条形码 | P1 |

### 2.2 产品列表

**GET** `/api/v1/products`

**查询参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | number | 页码 (默认 1) |
| `pageSize` | number | 每页数量 (默认 20, 最大 100) |
| `search` | string | 搜索 SKU/名称 |
| `category` | string | 分类筛选 |
| `status` | string | 状态: active, inactive, all |
| `sort` | string | 排序字段 |
| `order` | string | asc/desc |

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "sku": "ABC-001",
      "name": "Product A",
      "category": "Electronics",
      "cogs": 10.50,
      "status": "active",
      "createdAt": "2026-01-01T00:00:00Z",
      "updatedAt": "2026-02-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### 2.3 创建产品

**POST** `/api/v1/products`

**请求体**:
```json
{
  "sku": "ABC-001",
  "name": "Product A",
  "category": "Electronics",
  "cogs": 10.50,
  "upc": "123456789012",
  "description": "Product description"
}
```

**校验规则**:
| 字段 | 规则 |
|------|------|
| `sku` | 必填, 3-50字符, 唯一 |
| `name` | 可选, 最大 200 字符 |
| `cogs` | 数字, >= 0 |
| `upc` | 可选, 12-14 位数字 |

---

## 3. 采购管理 (Purchase)

### 3.1 供应商 (Suppliers)

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/purchase/suppliers` | 供应商列表 | P0 |
| GET | `/purchase/suppliers/:id` | 供应商详情 | P0 |
| POST | `/purchase/suppliers` | 创建供应商 | P0 |
| PATCH | `/purchase/suppliers/:id` | 更新供应商 | P0 |
| DELETE | `/purchase/suppliers/:id` | 删除供应商 | P1 |
| GET | `/purchase/suppliers/:id/strategies` | 供应商策略列表 | P0 |
| POST | `/purchase/suppliers/:id/strategies` | 创建策略 | P0 |

### 3.2 采购订单 (Purchase Orders)

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/purchase/orders` | PO 列表 | P0 |
| GET | `/purchase/orders/:id` | PO 详情 | P0 |
| POST | `/purchase/orders` | 创建 PO | P0 |
| PATCH | `/purchase/orders/:id` | 更新 PO | P0 |
| POST | `/purchase/orders/:id/submit` | 提交 PO | P0 |
| POST | `/purchase/orders/:id/cancel` | 取消 PO | P1 |
| GET | `/purchase/orders/:id/items` | PO 明细 | P0 |
| POST | `/purchase/orders/:id/items` | 添加明细 | P0 |
| PATCH | `/purchase/orders/:id/items/:itemId` | 更新明细 | P0 |
| DELETE | `/purchase/orders/:id/items/:itemId` | 删除明细 | P0 |

### 3.3 发货 (Shipments)

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/purchase/shipments` | 发货列表 | P0 |
| GET | `/purchase/shipments/:id` | 发货详情 | P0 |
| POST | `/purchase/shipments` | 创建发货单 | P0 |
| PATCH | `/purchase/shipments/:id` | 更新发货单 | P0 |
| POST | `/purchase/shipments/:id/confirm` | 确认发货 | P0 |

### 3.4 收货 (Receiving)

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/purchase/receiving` | 收货记录列表 | P0 |
| GET | `/purchase/receiving/:id` | 收货详情 | P0 |
| POST | `/purchase/receiving` | 创建收货记录 | P0 |
| POST | `/purchase/receiving/:id/confirm` | 确认收货 → 触发库存入库 | P0 |
| POST | `/purchase/receiving/:id/abnormal` | 异常收货处理 | P0 |

### 3.5 创建采购订单示例

**POST** `/api/v1/purchase/orders`

**请求体**:
```json
{
  "supplierId": "uuid",
  "orderDate": "2026-02-04",
  "expectedDate": "2026-02-14",
  "currency": "USD",
  "notes": "Urgent order",
  "items": [
    {
      "productId": "uuid",
      "quantity": 100,
      "unitPrice": 5.50
    },
    {
      "productId": "uuid",
      "quantity": 200,
      "unitPrice": 3.25
    }
  ]
}
```

**响应** (201):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "poNumber": "PO-2026-0001",
    "status": "draft",
    "supplierId": "uuid",
    "supplierName": "Supplier A",
    "orderDate": "2026-02-04",
    "expectedDate": "2026-02-14",
    "totalAmount": 1200.00,
    "currency": "USD",
    "items": [...]
  },
  "message": "Purchase order created successfully"
}
```

---

## 4. 库存管理 (Inventory)

### 4.1 FIFO 库存层

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/inventory/fifo-layers` | FIFO 层列表 | P0 |
| GET | `/inventory/fifo-layers/:productId` | 产品的 FIFO 层 | P0 |
| POST | `/inventory/fifo-layers/sync` | 触发 FIFO 同步 | P0 |

### 4.2 库存快照

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/inventory/snapshots` | 快照列表 | P0 |
| GET | `/inventory/snapshots/:date` | 指定日期快照 | P0 |
| POST | `/inventory/snapshots/create` | 创建快照 | P0 |
| GET | `/inventory/snapshots/export` | 导出快照 | P1 |

### 4.3 动态库存

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/inventory/dynamic` | 动态库存 (实时计算) | P0 |
| GET | `/inventory/dynamic/:productId` | 单产品动态库存 | P0 |

### 4.4 动态库存响应示例

**GET** `/api/v1/inventory/dynamic`

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "productId": "uuid",
      "sku": "ABC-001",
      "productName": "Product A",
      "inStock": 500,
      "inTransit": 200,
      "onOrder": 300,
      "availableQty": 500,
      "totalQty": 1000,
      "avgCost": 5.25,
      "totalValue": 5250.00,
      "currency": "USD",
      "lastUpdated": "2026-02-04T10:30:00Z"
    }
  ],
  "pagination": {...}
}
```

---

## 5. 销售管理 (Sales)

### 5.1 销售交易

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/sales/transactions` | 交易列表 | P0 |
| GET | `/sales/transactions/:id` | 交易详情 | P0 |
| POST | `/sales/transactions/import` | 导入交易 (CSV/API) | P0 |
| GET | `/sales/transactions/export` | 导出交易 | P1 |

### 5.2 销售报表

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/sales/reports/summary` | 销售汇总 | P0 |
| GET | `/sales/reports/by-product` | 按产品统计 | P0 |
| GET | `/sales/reports/by-period` | 按时间段统计 | P0 |
| GET | `/sales/reports/profitability` | 盈利分析 | P1 |

### 5.3 销售可视化

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/sales/charts/trend` | 销售趋势图数据 | P1 |
| GET | `/sales/charts/category` | 分类占比图数据 | P1 |

### 5.4 导入交易

**POST** `/api/v1/sales/transactions/import`

**请求 (multipart/form-data)**:
```
file: CSV文件
source: "amazon" | "ebay" | "manual"
options: {
  "skipDuplicates": true,
  "dryRun": false
}
```

**响应** (202 Accepted):
```json
{
  "success": true,
  "data": {
    "jobId": "uuid",
    "status": "processing",
    "totalRows": 1500,
    "progress": 0
  },
  "message": "Import job started. Check /jobs/:jobId for progress."
}
```

---

## 6. 财务管理 (Finance)

### 6.1 PO 付款

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/finance/po-payments` | PO 付款列表 | P0 |
| GET | `/finance/po-payments/:id` | 付款详情 | P0 |
| POST | `/finance/po-payments` | 创建付款 | P0 |
| POST | `/finance/po-payments/batch` | 批量付款 | P0 |

### 6.2 预付款 (Deposits)

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/finance/deposits` | 预付款列表 | P0 |
| POST | `/finance/deposits` | 创建预付款 | P0 |
| POST | `/finance/deposits/:id/apply` | 冲销预付款 | P0 |

### 6.3 物流费用

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/finance/logistics` | 物流费用列表 | P0 |
| POST | `/finance/logistics` | 创建物流费用 | P0 |
| POST | `/finance/logistics/batch` | 批量付款 | P0 |

### 6.4 落地成本计算

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| POST | `/finance/landed-cost/calculate` | 计算落地成本 | P0 |
| GET | `/finance/landed-cost/:receiveId` | 获取收货落地成本 | P0 |

### 6.5 落地成本计算示例

**POST** `/api/v1/finance/landed-cost/calculate`

**请求体**:
```json
{
  "receiveId": "uuid",
  "exchangeRate": 7.25,
  "logisticCost": 500.00,
  "otherCosts": [
    { "type": "customs", "amount": 100.00 },
    { "type": "insurance", "amount": 50.00 }
  ]
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "receiveId": "uuid",
    "items": [
      {
        "productId": "uuid",
        "sku": "ABC-001",
        "quantity": 100,
        "unitCostRMB": 35.00,
        "unitCostUSD": 4.83,
        "freightPerUnit": 0.50,
        "otherCostsPerUnit": 0.15,
        "landedCostPerUnit": 5.48,
        "totalLandedCost": 548.00
      }
    ],
    "summary": {
      "totalQuantity": 500,
      "totalLandedCost": 2740.00,
      "avgLandedCostPerUnit": 5.48
    }
  }
}
```

---

## 7. 用户管理 (Users)

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/users` | 用户列表 | P0 |
| GET | `/users/:id` | 用户详情 | P0 |
| POST | `/users` | 创建用户 | P0 |
| PATCH | `/users/:id` | 更新用户 | P0 |
| DELETE | `/users/:id` | 删除用户 | P1 |
| PATCH | `/users/:id/permissions` | 更新权限 | P0 |
| POST | `/users/:id/lock` | 锁定用户 | P0 |
| POST | `/users/:id/unlock` | 解锁用户 | P0 |
| POST | `/users/:id/reset-password` | 重置密码 | P0 |

---

## 8. 数据库运维 (DB Admin)

| Method | Endpoint | 功能 | 安全等级 | 优先级 |
|--------|----------|------|----------|--------|
| GET | `/db-admin/backups` | 备份列表 | L2 | P1 |
| POST | `/db-admin/backups` | 创建备份 | L3 | P1 |
| POST | `/db-admin/restore` | 恢复数据库 | L4 | P1 |
| POST | `/db-admin/clean-dev-data` | 清理开发数据 | L4 | P2 |
| GET | `/db-admin/health` | 数据库健康检查 | L1 | P0 |

---

## 9. 审计日志 (Audit)

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/audit/logs` | 审计日志列表 | P0 |
| GET | `/audit/logs/:id` | 日志详情 | P0 |
| GET | `/audit/logs/export` | 导出日志 | P1 |
| GET | `/audit/stats` | 统计数据 | P1 |

### 审计日志查询参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `dateFrom` | date | 开始日期 |
| `dateTo` | date | 结束日期 |
| `userId` | uuid | 用户 ID |
| `module` | string | 模块名称 |
| `action` | string | 操作类型 |
| `level` | string | 日志级别: info, warning, error |

---

## 10. 异步任务 (Jobs)

用于跟踪长时间运行的任务 (导入/导出/同步)。

| Method | Endpoint | 功能 | 优先级 |
|--------|----------|------|--------|
| GET | `/jobs` | 任务列表 | P0 |
| GET | `/jobs/:id` | 任务状态 | P0 |
| POST | `/jobs/:id/cancel` | 取消任务 | P1 |
| GET | `/jobs/:id/result` | 获取任务结果 | P0 |

### 任务状态响应

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "type": "sales_import",
    "status": "completed",
    "progress": 100,
    "totalItems": 1500,
    "processedItems": 1500,
    "failedItems": 3,
    "result": {
      "imported": 1497,
      "skipped": 0,
      "errors": [
        { "row": 523, "error": "Invalid date format" }
      ]
    },
    "startedAt": "2026-02-04T10:30:00Z",
    "completedAt": "2026-02-04T10:32:15Z"
  }
}
```

---

## 11. 实现清单

### 按模块优先级

| 阶段 | 模块 | 端点数 | 说明 |
|------|------|--------|------|
| Phase 2 Week 1 | Auth | 6 | 认证基础 |
| Phase 2 Week 2-3 | Users | 9 | 用户管理 |
| Phase 2 Week 4-6 | Products | 7 | 产品管理 |
| Phase 3 Week 1-3 | Purchase | 25+ | 采购全流程 |
| Phase 3 Week 4-6 | Inventory | 10+ | 库存 FIFO |
| Phase 3 Week 7-9 | Sales | 12+ | 销售 ETL |
| Phase 3 Week 10-12 | Finance | 15+ | 财务结算 |

### 总计

- **P0 端点**: ~80 个
- **P1 端点**: ~40 个
- **P2 端点**: ~10 个

---

*Version: 1.0.0*
*Created: 2026-02-04*
*Last Updated: 2026-02-04*
