# 销售模块 (Sales Module)

## 模块路径
- **Django App**: `backend/apps/sales/`
- **URL Prefix**: `/dashboard/sales/`
- **权限前缀**: `module.sales.*`

## 子模块清单

### 1. 交易数据 (Transactions)
**路径**: `/dashboard/sales/transactions/`
**权限**: `module.sales.transactions.upload`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 上传销售 CSV | 页面 + API | P0 | ETL Pipeline (V2.7.2) |
| 数据解析与转换 | 后端服务 | P0 | `etl/parser.py`, `transformer.py` |
| FIFO 同步 | 后端服务 | P0 | `fifo/sales_sync.py` |
| 上传历史查看 | 页面 | P1 | `Data_Clean_Log` 表 |
| 进度条显示 | 前端 | P1 | 30-85-99% 三阶段 |

**关键表**:
- `Data_Transaction` - 交易明细
- `Data_Clean_Log` - 清洗日志
- `in_fifo_layers` - FIFO 层

**依赖服务**:
- `ETLPipeline` (解析 → 转换 → 写入)
- `FIFOSalesSync` (库存同步)

---

### 2. 报表中心 (Reports)
**路径**: `/dashboard/sales/reports/`
**权限**: `module.sales.reports.generate`, `module.sales.reports.center`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 生成利润报表 | 页面 + API | P0 | `report_manager.py` |
| 报表中心 (历史) | 页面 | P1 | 文件列表 |
| 导出 Excel | API | P0 | pandas → xlsx |
| 按 SKU/Combo 分析 | 页面 | P1 | `finance/profit_*.py` |

**关键表**:
- `Data_Transaction` - 数据源
- `Data_COGS` - 成本数据
- `in_fifo_layers` - 成本追踪

---

### 3. 数据可视化 (Visuals)
**路径**: `/dashboard/sales/visuals/`
**权限**: `module.sales.visuals.dashboard`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 销售趋势图 | 页面 | P1 | Altair 图表 |
| SKU 排行榜 | 页面 | P1 | 动态渲染 |
| 时间范围筛选 | 前端 | P1 | Date Picker |

**关键表**:
- `Data_Transaction` - 数据源

---

## API 端点清单

| Method | Path | 功能 | 优先级 |
|--------|------|------|--------|
| GET | `/sales/` | 销售 Hub 页面 | P0 |
| GET | `/sales/transactions/` | 上传页面 | P0 |
| POST | `/sales/transactions/upload/` | 上传 CSV | P0 |
| GET | `/sales/transactions/progress/<id>/` | 获取进度 | P1 |
| GET | `/sales/reports/` | 报表页面 | P0 |
| POST | `/sales/reports/generate/` | 生成报表 | P0 |
| GET | `/sales/reports/download/<id>/` | 下载报表 | P0 |
| GET | `/sales/visuals/` | 可视化页面 | P1 |
| GET | `/sales/visuals/data/` | 图表数据 API | P1 |

---

## 迁移注意事项

### 复杂度评估: 🟡 中等

| 风险点 | 说明 | 解决方案 |
|--------|------|----------|
| ETL Pipeline | 核心业务逻辑复杂 | 需逐行对照移植 |
| FIFO 同步 | 原子性要求高 | 保持事务一致性 |
| 文件上传 | 大文件处理 | 改用异步队列 |

### 建议迁移顺序
1. 先迁移 Reports (只读，风险低)
2. 再迁移 Visuals (只读，风险低)  
3. 最后迁移 Transactions (写入，风险高)

---

*Last Updated: 2026-02-04*
