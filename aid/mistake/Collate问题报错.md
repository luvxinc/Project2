# MySQL Collation 不一致问题报告

> **Purpose**: 此文件记录了一个关键的数据库 Collation 不一致事故及其解决方案。它的作用是**防止回滚**（Regression Prevention）。
> **AI Attention**: 在创建新表或进行 Schema 变更时，**务必** 检查是否符合 `utf8mb4_unicode_ci` 标准，避免重犯此错误。
> **Constraints**: `WARNING` - 这是一个已知的“坑”，请避开。
> **Related Files**: 
> - `aid/system/数据库表.md`: 包含正确的建表标准。



> **修复日期**: 2026-01-08  
> **最后审计**: 2026-01-09  
> **影响范围**: 全数据库表  
> **修复状态**: ✅ 已完成

---

## 1. 问题描述

### 1.1 错误现象

在定金付款向导 (`Deposit Batch Payment Wizard`) Step 3 提交付款时，前端收到 `未找到订单信息` 错误。

### 1.2 根因分析

通过服务器日志发现 SQL 查询报错：

```
🔥 DATABASE QUERY ERROR: (pymysql.err.OperationalError) (1267, "Illegal mix of collations (utf8mb4_unicode_ci,IMPLICIT) and (utf8mb4_0900_ai_ci,IMPLICIT) for operation '='")
```

**问题根因**：数据库中不同表使用了**不同的字符集排序规则 (Collation)**：

| Collation | 说明 | 数量 |
|-----------|------|------|
| `utf8mb4_0900_ai_ci` | MySQL 8.0 默认 | 27 个表 |
| `utf8mb4_unicode_ci` | 项目标准 | 16 个表 |

当两张表的 `po_num` 字段使用不同 collation 进行 JOIN 或比较时，MySQL 无法隐式转换，导致查询失败。

### 1.3 隐蔽性

`DBClient.read_df()` 方法静默捕获异常并返回空 DataFrame：

```python
# core/components/db/client.py
except Exception as e:
    print(f"🔥 DATABASE QUERY ERROR: {e}")
    return pd.DataFrame()  # 静默返回空结果
```

这导致错误被隐藏，表现为 "未找到数据" 而非明确的 SQL 错误。

---

## 2. 问题触发场景

### 2.1 触发的 SQL 语句

```sql
SELECT s.po_num, ...
FROM in_po_strategy s            -- utf8mb4_0900_ai_ci
LEFT JOIN in_po_final f          -- utf8mb4_unicode_ci
    ON s.po_num = f.po_num       -- 冲突!
```

### 2.2 受影响的表对

| 表1 (原 utf8mb4_0900_ai_ci) | 表2 (utf8mb4_unicode_ci) | 关联字段 |
|-----------------------------|--------------------------|----------|
| `in_po_strategy` | `in_po_final` | `po_num` |
| `in_pmt_logistic` | `in_send` | `logistic_num` |
| `in_supplier` | `in_pmt_prepay_final` | `supplier_code` |

---

## 3. 修复方案

### 3.1 统一 Collation

将所有表统一为 `utf8mb4_unicode_ci`（项目标准）：

```sql
SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE `auth_group` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `auth_group_permissions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `auth_permission` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `auth_user` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `auth_user_groups` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `auth_user_user_permissions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `Data_Clean_Log` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `Data_COGS` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `Data_Inventory` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `Data_Order_Earning` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `Data_Transaction` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `django_admin_log` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `django_content_type` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `django_migrations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `django_session` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `in_mgmt_barcode` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `in_pmt_logistic` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `in_po` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `in_po_strategy` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `in_supplier` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `in_supplier_strategy` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `System_Audit_Log_Django` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `System_Error_Patch_Status` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `System_Locks` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `User_Account` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `User_Login_History` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `User_Permission` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
```

**注意**：需要 `SET FOREIGN_KEY_CHECKS = 0` 来绕过外键约束检查，否则会报错：
```
ERROR 3780 (HY000): Referencing column 'supplier_code' and referenced column 'supplier_code' in foreign key constraint 'xxx' are incompatible.
```

### 3.2 清理代码中的 Workaround

之前为临时解决 collation 冲突，代码中添加了 `COLLATE` 子句：

```sql
-- 旧代码 (Workaround)
LEFT JOIN in_send s ON p.logistic_num COLLATE utf8mb4_unicode_ci = s.logistic_num COLLATE utf8mb4_unicode_ci
```

统一 collation 后，已清理为标准写法：

```sql
-- 新代码 (Clean)
LEFT JOIN in_send s ON p.logistic_num = s.logistic_num
```

**已清理的文件**：

| 文件 | 行号 | 修改内容 |
|------|------|----------|
| `apps/finance/views/deposit/api.py` | 397 | 移除 COLLATE |
| `apps/finance/views/payment/history.py` | 261-262 | 移除 COLLATE |
| `apps/finance/views/prepay/api.py` | 845 | 移除 COLLATE |

---

## 4. 受影响的功能模块

### 4.1 财务模块 (Finance)

| 功能 | 涉及表 | 状态 |
|------|--------|------|
| 定金付款向导 | `in_po_strategy`, `in_po_final`, `in_pmt_deposit` | ✅ 已修复 |
| 物流付款历史 | `in_pmt_logistic`, `in_send` | ✅ 已修复 |
| 预付款详情 | `in_pmt_prepay_final`, `in_supplier` | ✅ 已修复 |

### 4.2 采购模块 (Purchase)

| 功能 | 涉及表 | 状态 |
|------|--------|------|
| 订单策略管理 | `in_po_strategy`, `in_po` | ✅ 已统一 |
| 发货管理 | `in_send`, `in_send_list` | ✅ 已统一 |
| 收货管理 | `in_receive` | ✅ 已统一 |

### 4.3 系统模块

| 功能 | 涉及表 | 状态 |
|------|--------|------|
| 用户认证 | `auth_*`, `User_*` | ✅ 已统一 |
| 审计日志 | `System_Audit_Log_Django` | ✅ 已统一 |
| Django 系统表 | `django_*` | ✅ 已统一 |

---

## 5. 验证结果

### 5.1 表 Collation 统一检查

```sql
SELECT TABLE_COLLATION, COUNT(*) as table_count
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'MGMT' 
GROUP BY TABLE_COLLATION;
```

结果：
```
TABLE_COLLATION         table_count
utf8mb4_unicode_ci      43
```

✅ **所有 43 个表已统一**

### 5.2 JOIN 功能验证

```sql
-- 测试 1: 订单策略 ↔ 订单明细
SELECT COUNT(*) FROM in_po_strategy s 
LEFT JOIN in_po_final f ON s.po_num = f.po_num;
-- 结果: 17 (成功)

-- 测试 2: 物流付款 ↔ 发货记录
SELECT COUNT(*) FROM in_pmt_logistic p
LEFT JOIN in_send s ON p.logistic_num = s.logistic_num;
-- 结果: 0 (成功，无数据)

-- 测试 3: 预付款 ↔ 供应商
SELECT COUNT(*) FROM in_pmt_prepay_final f
LEFT JOIN in_supplier s ON f.supplier_code = s.supplier_code;
-- 结果: 9 (成功)
```

---

## 6. 预防措施

### 6.1 建表标准

**所有新建表必须指定**：

```sql
CREATE TABLE `xxx` (
    ...
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 6.2 检查脚本 (可选)

定期检查是否有 collation 不一致：

```sql
SELECT TABLE_NAME, TABLE_COLLATION 
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'MGMT' 
  AND TABLE_COLLATION != 'utf8mb4_unicode_ci';
```

如果返回任何记录，说明存在不一致，需要修复。

---

## 7. 参考资料

- MySQL 官方文档: [Character Set and Collation Compatibility](https://dev.mysql.com/doc/refman/8.0/en/charset-collation-compatibility.html)
- 错误代码 1267: `Illegal mix of collations`
- SQLAlchemy 行为: `pd.read_sql()` + `text()` 在遇到此类错误时会抛出异常，被 `DBClient` 静默捕获

---

## 8. 版本记录

| 日期 | 操作 | 操作人 |
|------|------|--------|
| 2026-01-08 | 发现问题并修复，统一 43 个表为 utf8mb4_unicode_ci | Agent |
