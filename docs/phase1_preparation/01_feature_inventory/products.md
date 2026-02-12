# 产品模块 (Products Module)

## 模块路径
- **Django App**: `backend/apps/products/`
- **URL Prefix**: `/dashboard/products/`
- **权限前缀**: `module.products.*`

## 子模块清单

### 1. 产品数据维护 (COGS)
**路径**: `/dashboard/db_admin/data_change/` (嵌入 DB Admin)
**权限**: `module.products.catalog.cogs`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| COGS 表格编辑 | 页面 | P0 | Inline Edit |
| 批量更新 | API | P0 | JSON 提交 |
| 分类/子分类维护 | 表单 | P1 | Dropdown |

**关键表**:
- `Data_COGS` - 产品成本表

**复杂度**: 🟢 低

---

### 2. 新增产品 (Create SKU)
**路径**: `/dashboard/db_admin/data_change/` (嵌入 DB Admin)
**权限**: `module.products.catalog.create`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 新增产品向导 | 3 步 Wizard | P0 | V2.2 |
| SKU 校验 | 前端 + 后端 | P0 | 大写 + 唯一性 |
| 初始化库存 | API | P0 | 创建 INIT 层 |

**复杂度**: 🟡 中等

---

### 3. 条形码生成 (Barcode)
**路径**: `/dashboard/products/barcode/`
**权限**: `module.products.barcode.generate`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 选择 SKU | 表单 | P1 | Dropdown |
| 生成条形码 | API | P1 | Python 库 |
| 下载 PDF | API | P1 | PDF 生成 |

**关键目录**:
- `data/barcodes/` - 生成的条形码文件

**复杂度**: 🟢 低

---

## API 端点清单

| Method | Path | 功能 | 优先级 |
|--------|------|------|--------|
| GET | `/products/` | Hub 页面 | P0 |
| GET | `/products/cogs/table/` | COGS 表格 | P0 |
| POST | `/products/cogs/update/` | 批量更新 | P0 |
| POST | `/products/create/` | 创建 SKU | P0 |
| GET | `/products/barcode/` | 条形码页面 | P1 |
| POST | `/products/barcode/generate/` | 生成条形码 | P1 |

---

## 迁移注意事项

### 复杂度评估: 🟢 低

| 风险点 | 说明 | 解决方案 |
|--------|------|----------|
| Inline Edit | 表格内编辑 | TanStack Table |
| 条形码生成 | 依赖库 | Node.js 替代库 |

### 建议迁移顺序
1. 先迁移 COGS (最简单)
2. 再迁移 Create SKU
3. 最后 Barcode (独立)

---

*Last Updated: 2026-02-04*
