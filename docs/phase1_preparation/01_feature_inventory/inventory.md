# 库存模块 (Inventory Module)

## 模块路径
- **Django App**: `backend/apps/inventory/`
- **URL Prefix**: `/dashboard/inventory/`
- **权限前缀**: `module.inventory.*`

## 子模块清单

### 1. 库存盘点 (Stocktake)
**路径**: `/dashboard/inventory/stocktake/`
**权限**: `module.inventory.stocktake.upload`, `module.inventory.stocktake.modify`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 上传盘点 CSV | 页面 + API | P0 | 文件解析入库 |
| 库存修改向导 | 3 步 Wizard | P1 | 单值修改 |
| 删除库存列 | API | P2 | 高危操作 |

**关键表**:
- `Data_Inventory` - 库存快照 (列式存储)

**复杂度**: 🟢 低

---

### 2. 动态库存 (Dynamic Inventory)
**路径**: `/dashboard/inventory/dynamic/`
**权限**: `module.inventory.dynamic.view`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 实时库存视图 | 页面 | P0 | 动态计算 |
| FIFO 成本追踪 | 页面 | P0 | 层级展示 |
| 筛选/搜索 | 前端 | P0 | 客户端过滤 |
| 导出 Excel | API | P1 | pandas → xlsx |

**关键表**:
- `in_fifo_layers` - FIFO 层
- `in_receive_final` - 入库终态
- `Data_Transaction` - 销售出库

**复杂度**: 🟡 中等 (实时计算逻辑)

---

### 3. 货架码管理 (Shelf)
**路径**: `/dashboard/inventory/shelf/`
**权限**: `module.inventory.shelf.manage`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 货架码列表 | 页面 | P1 | 表格 |
| 新增货架码 | API | P1 | 表单 |
| 编辑/删除 | API | P2 | CRUD |

**复杂度**: 🟢 低

---

### 4. 库存预警 (Alerts)
**权限**: N/A (自动)

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 低库存预警 | 自动 | P2 | 阈值触发 |
| 预警通知 | 自动 | P2 | 未实现 |

**复杂度**: 🟢 低

---

## FIFO 核心逻辑

```
FIFO 层 (in_fifo_layers)
├── INIT 层 (历史库存初始化)
├── IN 层 (入库新增)
└── OUT 层 (销售消耗)

动态库存 = Σ(所有层的剩余数量)
动态成本 = Σ(各层剩余数量 × 该层单位成本) / 动态库存
```

**关键服务**:
- `FIFOSalesSync.sync_sale()` - 销售消耗
- `InventoryService.get_dynamic_inventory()` - 实时计算

---

## API 端点清单

| Method | Path | 功能 | 优先级 |
|--------|------|------|--------|
| GET | `/inventory/` | Hub 页面 | P0 |
| GET | `/inventory/stocktake/` | 盘点页面 | P0 |
| POST | `/inventory/stocktake/upload/` | 上传 CSV | P0 |
| GET | `/inventory/dynamic/` | 动态库存 | P0 |
| GET | `/inventory/dynamic/api/` | 动态数据 API | P0 |
| GET | `/inventory/dynamic/export/` | 导出 Excel | P1 |
| GET | `/inventory/shelf/` | 货架管理 | P1 |

---

## 迁移注意事项

### 复杂度评估: 🟡 中等

| 风险点 | 说明 | 解决方案 |
|--------|------|----------|
| FIFO 计算 | 核心业务逻辑 | 逐行对照移植 |
| 动态视图 | 实时聚合查询 | 优化 SQL / 缓存 |
| 列式存储 | 特殊 Schema | 考虑改为行式 |

### 建议迁移顺序
1. 先迁移 Shelf (最简单)
2. 再迁移 Stocktake (上传逻辑)
3. 最后迁移 Dynamic (最复杂)

---

*Last Updated: 2026-02-04*
