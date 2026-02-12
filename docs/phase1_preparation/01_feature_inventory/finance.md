# 财务模块 (Finance Module)

## 模块路径
- **Django App**: `backend/apps/finance/`
- **URL Prefix**: `/dashboard/finance/`
- **权限前缀**: `module.finance.*`

## 子模块清单

### 1. 定发收总览 (Flow Overview)
**路径**: `/dashboard/finance/flow/`
**权限**: `module.finance.flow.view`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 采购流程总览 | 页面 | P0 | 卡片视图 |
| 定/发/收状态统计 | 页面 | P0 | 聚合查询 |
| 快捷跳转 | 前端 | P0 | 链接 |

**复杂度**: 🟢 低

---

### 2. 物流财务 (Logistic)
**路径**: `/dashboard/finance/logistic/`
**权限**: `module.finance.logistic.manage`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 物流费用列表 | 页面 | P0 | 表格 |
| 批量付款 | Wizard | P0 | 多选 + 确认 |
| 单笔付款 | Modal | P0 | 表单 |
| 上传凭证 | API | P0 | 文件上传 |
| 费用调整 | API | P1 | 加减金额 |

**关键表**:
- `in_send_final` - 发货终态 (含物流费)
- `in_finance_logistic` - 物流付款记录

**复杂度**: 🟡 中等

---

### 3. 预付款管理 (Prepay)
**路径**: `/dashboard/finance/prepay/`
**权限**: `module.finance.prepay.manage`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 预付款列表 | 页面 | P1 | 按供应商分组 |
| 新增预付款 | Modal | P1 | 表单 |
| 预付款核销 | API | P1 | 关联 PO |

**关键表**:
- `in_finance_prepay` - 预付款记录

**复杂度**: 🟢 低

---

### 4. 定金付款 (Deposit)
**路径**: `/dashboard/finance/deposit/`
**权限**: `module.finance.deposit.manage`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 定金列表 | 页面 | P0 | 表格 |
| 批量付款 | Wizard | P0 | 多选 + 确认 |
| 单笔付款 | Modal | P0 | 表单 |
| 上传凭证 | API | P0 | 文件上传 |

**关键表**:
- `in_po_final` - PO 终态 (含定金状态)
- `in_finance_deposit` - 定金付款记录

**复杂度**: 🟡 中等

---

### 5. 订单付款 (PO Payment)
**路径**: `/dashboard/finance/po/`
**权限**: `module.finance.po.manage`

| 功能 | 类型 | 优先级 | 当前实现 |
|------|------|--------|----------|
| 待付款列表 | 页面 | P0 | 按供应商分组 |
| 批量付款 | Wizard | P0 | 多选 + 确认 |
| 单笔付款 | Modal | P0 | 表单 |
| 上传凭证 | API | P0 | 文件上传 |
| 付款历史 | 页面 | P1 | 时间线 |

**关键表**:
- `in_po_final` - PO 终态
- `in_finance_po` - PO 付款记录

**复杂度**: 🟡 中等

---

## 成本计算服务

**Landed Price 计算**:
```
落地成本 = (采购成本 + 物流费 + 关税 + 其他费用) / 入库数量
```

**关键服务**:
- `calculate_landed_prices()` - 落地价计算
- `ProfitCalculator` - 利润计算

---

## API 端点清单

| Method | Path | 功能 | 优先级 |
|--------|------|------|--------|
| GET | `/finance/` | Hub 页面 | P0 |
| GET | `/finance/flow/` | 流程总览 | P0 |
| GET | `/finance/logistic/` | 物流财务 | P0 |
| POST | `/finance/logistic/pay/` | 批量付款 | P0 |
| GET | `/finance/deposit/` | 定金管理 | P0 |
| POST | `/finance/deposit/pay/` | 批量付款 | P0 |
| GET | `/finance/po/` | 订单付款 | P0 |
| POST | `/finance/po/pay/` | 批量付款 | P0 |
| GET | `/finance/prepay/` | 预付款 | P1 |

---

## 迁移注意事项

### 复杂度评估: 🟡 中等

| 风险点 | 说明 | 解决方案 |
|--------|------|----------|
| 批量付款 | 多选状态管理 | React 状态管理 |
| 文件上传 | 凭证存储 | S3 兼容存储 |
| 金额计算 | 精度问题 | Decimal 类型 |
| 汇率转换 | CNY/USD | 统一 USD 存储 |

### 建议迁移顺序
1. 先迁移 Flow (只读)
2. 再迁移 Prepay (最简单)
3. 然后 Deposit / PO Payment (相似逻辑)
4. 最后 Logistic (含费用调整)

---

*Last Updated: 2026-02-04*
