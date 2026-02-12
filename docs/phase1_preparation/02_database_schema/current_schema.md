# 当前数据库 Schema 分析

## 数据库信息
- **类型**: MySQL 8.x
- **名称**: MGMT
- **字符集**: utf8mb4

## 表分类

### 1. Django 内置表 (不迁移，自动生成)
| 表名 | 说明 |
|------|------|
| `auth_user` | 用户表 |
| `auth_group` | 用户组 |
| `auth_permission` | 权限 |
| `django_session` | 会话 |
| `django_content_type` | 内容类型 |
| `django_migrations` | 迁移记录 |
| `django_admin_log` | Admin 日志 |

### 2. 业务核心表 (必须迁移)

#### 产品相关
| 表名 | 说明 | 记录数 | 迁移优先级 |
|------|------|--------|-----------|
| `Data_COGS` | 产品成本 | ~200 | P0 |

#### 库存相关
| 表名 | 说明 | 记录数 | 迁移优先级 |
|------|------|--------|-----------|
| `Data_Inventory` | 库存快照 (列式) | ~200 | P0 |
| `in_fifo_layers` | FIFO 层 | ~350 | P0 |

#### 交易相关
| 表名 | 说明 | 记录数 | 迁移优先级 |
|------|------|--------|-----------|
| `Data_Transaction` | 交易明细 | ~28000 | P0 |
| `Data_Clean_Log` | 清洗日志 | ~30000 | P0 |

#### 采购相关
| 表名 | 说明 | 记录数 | 迁移优先级 |
|------|------|--------|-----------|
| `in_supplier` | 供应商 | ~10 | P0 |
| `in_supplier_strategy` | 供应商策略 | ~50 | P0 |
| `in_po_input` | PO 输入 | ~50 | P0 |
| `in_po_input_items` | PO 明细 | ~200 | P0 |
| `in_po_final` | PO 终态 | ~50 | P0 |
| `in_send_input` | 发货输入 | ~30 | P0 |
| `in_send_input_items` | 发货明细 | ~150 | P0 |
| `in_send_final` | 发货终态 | ~30 | P0 |
| `in_receive_input` | 入库输入 | ~20 | P0 |
| `in_receive_input_items` | 入库明细 | ~100 | P0 |
| `in_receive_final` | 入库终态 | ~20 | P0 |

#### 财务相关
| 表名 | 说明 | 记录数 | 迁移优先级 |
|------|------|--------|-----------|
| `in_finance_deposit` | 定金付款 | ~20 | P0 |
| `in_finance_logistic` | 物流付款 | ~20 | P0 |
| `in_finance_po` | PO 付款 | ~30 | P0 |
| `in_finance_prepay` | 预付款 | ~5 | P1 |

### 3. 日志表
| 表名 | 说明 | 记录数 | 迁移优先级 |
|------|------|--------|-----------|
| `log_audit` | 审计日志 | ~5000 | P1 (可不迁移历史) |
| `log_business` | 业务日志 | ~3000 | P1 |
| `log_error` | 错误日志 | ~500 | P2 |
| `log_access` | 访问日志 | ~10000 | P2 |

### 4. 配置表
| 表名 | 说明 | 记录数 | 迁移优先级 |
|------|------|--------|-----------|
| `system_locks` | 系统锁 | ~5 | P0 |

---

## Schema 问题分析

### 问题 1: 列式存储 (Data_Inventory)
**现状**: 日期作为列名 (`2025-01-01`, `2025-01-02`, ...)
**问题**: 
- 难以索引
- 难以查询
- 列数不断增长

**建议**: 改为行式存储
```sql
-- 当前
| SKU | 2025-01-01 | 2025-01-02 | ...
|-----|------------|------------|
| A   | 100        | 95         |

-- 建议
| id | sku | date       | quantity |
|----|-----|------------|----------|
| 1  | A   | 2025-01-01 | 100      |
| 2  | A   | 2025-01-02 | 95       |
```

### 问题 2: 无外键约束
**现状**: 表之间通过业务逻辑关联，无数据库级外键
**问题**: 数据完整性依赖代码
**建议**: 在新 Schema 中添加外键约束

### 问题 3: 金额精度
**现状**: 部分金额字段使用 FLOAT
**问题**: 浮点数精度问题
**建议**: 改用 DECIMAL(10,2)

### 问题 4: 时间戳不统一
**现状**: 部分表有 `created_at`/`updated_at`，部分没有
**建议**: 所有表统一添加时间戳字段

---

## 导出命令

```bash
# 导出 Schema (仅结构)
mysqldump -u root -p --no-data MGMT > schema_only.sql

# 导出完整数据
mysqldump -u root -p MGMT > full_backup.sql

# 导出单表
mysqldump -u root -p MGMT Data_COGS > cogs_backup.sql
```

---

## ER 图 (简化版)

详见: [er_diagram.md](./er_diagram.md)

---

*Last Updated: 2026-02-04*
