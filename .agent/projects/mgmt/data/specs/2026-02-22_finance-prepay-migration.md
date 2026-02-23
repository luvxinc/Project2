# Finance Prepayment Module — V1→V3 迁移最终 Spec

> **Task**: 将 V1 厂商预付款管理忠实迁移到 V3
> **Created**: 2026-02-22
> **Status**: SPEC_FINAL (已做出所有设计决策)
> **Iron Rule**: R7 — 忠实迁移，不猜测，不杜撰
> **Scope**: 只做预付款页面本身功能。PO/定金的跨模块写入暂不实现。
> **Data**: V1 生产数据必须零丢失零修改 ETL 到 V3。

---

## D1: Schema 设计决策 (原 Q1)

### 决策：扩展现有 `payments` 表，不建新表

**理由**：
1. V3 统一 `payments` 表是 V3 Schema 的设计意图（V3__inventory_module.sql 注释: "8 payment tables merged → 统一付款表"）
2. 预付款记录已经有 `payment_type='prepay'` 判别值和 `prepay_tran_type` ENUM
3. 只缺 1 个字段 `tran_curr_req`（供应商要求货币），其余字段均已有对应

**需要添加的字段（仅 1 个）**：

| 字段名 | 类型 | 说明 | 为什么需要 |
|--------|------|------|------------|
| `tran_curr_req` | `VARCHAR(3)` | 供应商要求货币 | V1 余额计算的核心：当操作货币 ≠ 供应商要求货币时需按汇率转换。V3 `currency` 字段对应 V1 的 `tran_curr_use`（操作货币），但缺少对应 V1 `tran_curr_req`（要求货币）的字段 |

**不需要添加的字段及原因**：

| V1 字段 | 为什么不需要 |
|---------|-------------|
| `tran_ops` (new/adjust) | V3 用 `deleted_at` 实现软删除；操作历史由 `payment_events` 表 (append-only) 记录 |
| `tran_seq` (T01/T02...) | V3 用 `payment_events.event_seq` 记录版本序号 |
| `tran_type` (in/out) | V3 用 `prepay_tran_type` ENUM 替代: deposit=充值(in), usage=使用(out), refund=退回(in) |

### V1→V3 字段完整映射

| V1 `in_pmt_prepay` | V3 `payments` | 说明 |
|---------------------|---------------|------|
| `tran_num` | `payment_no` | ✅ 流水号 |
| `supplier_code` | `supplier_code` + `supplier_id` | ✅ 供应商 |
| `tran_date` | `payment_date` | ✅ 日期 |
| `tran_curr_req` | `tran_curr_req` (**新增**) | ⬆️ 供应商要求货币 |
| `tran_curr_use` | `currency` | ✅ 操作货币 |
| `usd_rmb` | `exchange_rate` | ✅ 汇率 |
| `tran_curr_type` (A/M) | `rate_mode` (auto/manual) | ✅ 汇率来源 |
| `tran_amount` | `cash_amount` | ✅ 金额 |
| `tran_type` (in/out) | `prepay_tran_type` (deposit/usage/refund) | ✅ 交易类型 |
| `tran_ops` (new/adjust) | `payment_events.event_type` | ✅ 操作类型→事件表 |
| `tran_seq` (T01...) | `payment_events.event_seq` | ✅ 版本号→事件表 |
| `tran_by` | `created_by` / `payment_events.operator` | ✅ 操作人 |
| `tran_note` | `note` / `payment_events.note` | ✅ 备注 |

---

## D2: 历史记录 / 审计合规设计决策 (原 Q2)

### 决策：创建 `payment_events` Domain Event 表 (与 PO/Shipment 一致)

**理由**：
1. **V3 已有先例**：`purchase_order_events` (V10) 和 `shipment_events` (V12) 都是 domain-specific append-only event 表
2. **审计合规**：append-only 表不可修改不可删除，满足金融审计要求（`change_history` 虽也可用，但其 JSONB 格式不够直观）
3. **ETL 友好**：V1 `in_pmt_prepay` 是 mutation log，其每一行直接映射为 `payment_events` 的一行
4. **查询高效**：历史三栏视图直接 `SELECT * FROM payment_events WHERE payment_id=? ORDER BY event_seq` ，无需解析 JSONB

### `payment_events` 表结构

```sql
CREATE TABLE IF NOT EXISTS payment_events (
    id            BIGSERIAL    PRIMARY KEY,
    payment_id    BIGINT       NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    payment_no    VARCHAR(100) NOT NULL,     -- 冗余，便于查询
    event_type    VARCHAR(30)  NOT NULL,     -- CREATE / DELETE / RESTORE / RATE_CHANGE / AMOUNT_CHANGE
    event_seq     INT          NOT NULL,     -- per-payment sequence (1,2,3... maps to V1 T01/T02/T03)
    changes       JSONB        NOT NULL DEFAULT '{}',  -- before/after diff
    note          VARCHAR(500),              -- 操作备注
    operator      VARCHAR(50)  NOT NULL,     -- 操作人
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(payment_id, event_seq)
);
```

### V1→V3 事件映射

| V1 `tran_ops` | V1 `tran_seq` | V3 `event_type` | V3 `event_seq` | 说明 |
|---------------|---------------|-----------------|-----------------|------|
| `new` | T01 | `CREATE` | 1 | 首次创建 |
| `adjust` (amount=0) | T02 | `DELETE` | 2 | 软删除 |
| `adjust` (amount>0, after delete) | T03 | `RESTORE` | 3 | 恢复 |
| `adjust` (rate changed) | T0x | `RATE_CHANGE` | x | 汇率修改 |
| `adjust` (amount changed) | T0x | `AMOUNT_CHANGE` | x | 金额修改 |

### 历史三栏数据来源

| 栏位 | V1 数据源 | V3 数据源 |
|------|-----------|-----------|
| 左栏：厂商策略修改 | `in_supplier_strategy` 多行 | `supplier_strategies` 多行 (V3 每个策略变更就是一新行) |
| 中栏：汇率/货币修改 | `in_pmt_prepay` 同 tran_num 多行对比 | `payment_events` WHERE payment_id=? |
| 右栏：金额修订 | 同上 | 同上 |

---

## D3: 当前 Scope 界定

### 纳入本次实施：
1. ✅ Flyway 增量 SQL（payments 加字段 + payment_events 表）
2. ✅ Finance 模块 Backend (DDD 分层: api / application / domain)
3. ✅ 预付款页面 11 个 API 端点
4. ✅ Finance 前端页面 (Next.js)
5. ✅ ETL 脚本：V1 `in_pmt_prepay` + `in_pmt_prepay_final` → V3 `payments` + `payment_events`
6. ✅ Action Key / Permission 注册

### 排除，留到对应板块时做：
1. ❌ PO 付款向导中的预付款抵扣逻辑（PO 付款模块迁移时做）
2. ❌ 定金付款向导中的预付款抵扣逻辑（定金模块迁移时做）
3. ❌ PO/定金删除时的预付款退回逻辑（同上）
4. ❌ Flow 定发收总预览模块

### 影响分析：
- **已有交易中 tran_type='out' 的记录**：V1 中由 PO/定金模块写入。ETL 迁移时原样保留到 V3 payments 表中（prepay_tran_type='usage'）。前端展示时正常显示为「使用」类型。
- **余额计算**：在已有 out 记录存在的情况下，余额计算仍正确。新增的 out 记录（PO/定金抵扣）暂时无法通过 V3 产生，但历史数据完整。

---

## D4: 实施文件清单

### Phase 1: Schema (2 files)

| # | 文件 | 内容 |
|---|------|------|
| 1 | `V19__payment_prepay_fields.sql` | ALTER payments ADD tran_curr_req; CREATE payment_events |
| 2 | `V20__etl_prepay_data.sql` | V1→V3 数据迁移 ETL (需要验证后再运行) |

### Phase 2: Backend (新建 Finance Module, ~8 files)

| # | 文件 | 内容 |
|---|------|------|
| 3 | `modules/finance/domain/model/PaymentEvent.kt` | payment_events Entity |
| 4 | `modules/finance/domain/repository/PrepaymentRepository.kt` | 预付款专用查询 |
| 5 | `modules/finance/domain/repository/PaymentEventRepository.kt` | 事件查询 |
| 6 | `modules/finance/application/dto/PrepaymentDtos.kt` | 请求/响应 DTO |
| 7 | `modules/finance/application/usecase/PrepaymentUseCase.kt` | 核心业务逻辑 |
| 8 | `modules/finance/application/usecase/PrepaymentBalanceService.kt` | 余额计算服务 |
| 9 | `modules/finance/api/PrepaymentController.kt` | REST 控制器 (11 endpoints) |
| 10 | `modules/finance/infrastructure/PrepaymentFileService.kt` | 文件管理 |

### Phase 3: Frontend (新建 Finance 路由, ~6 files)

| # | 文件 | 内容 |
|---|------|------|
| 11 | `app/(dashboard)/finance/layout.tsx` | Finance 模块布局 |
| 12 | `app/(dashboard)/finance/prepay/page.tsx` | 预付款主页面（双栏布局） |
| 13 | `app/(dashboard)/finance/prepay/components/SupplierBalanceList.tsx` | 左栏供应商卡片 |
| 14 | `app/(dashboard)/finance/prepay/components/TransactionTable.tsx` | 右栏交易表格 |
| 15 | `app/(dashboard)/finance/prepay/components/PrepayWizard.tsx` | 新增向导 |
| 16 | `app/(dashboard)/finance/prepay/components/HistoryPanel.tsx` | 历史三栏 |

### Phase 4: i18n + Navigation

| # | 文件 | 内容 |
|---|------|------|
| 17 | `locales/en/finance.json` | 英文翻译 |
| 18 | `locales/zh/finance.json` | 中文翻译 |
| 19 | `AppleNav.tsx` (更新) | 添加 finance 模块导航 |

---

## D5: API 端点详设

| # | Method | V3 Path | V1 对应 | SecurityLevel |
|---|--------|---------|---------|---------------|
| 1 | `GET` | `/finance/prepayments/balances` | supplier_balance_api | — (view only) |
| 2 | `GET` | `/finance/prepayments/transactions` | transaction_list_api | — (view only) |
| 3 | `POST` | `/finance/prepayments` | submit_prepay_api | L2 btn_prepay_submit |
| 4 | `GET` | `/finance/prepayments/{paymentNo}/history` | prepay_history_api | — (view only) |
| 5 | `DELETE` | `/finance/prepayments/{id}` | prepay_delete_api | L3 btn_prepay_delete |
| 6 | `POST` | `/finance/prepayments/{id}/restore` | prepay_restore_api | L2 btn_prepay_undelete |
| 7 | `GET` | `/finance/prepayments/{paymentNo}/files` | file_info_api | — (view only) |
| 8 | `GET` | `/finance/prepayments/{paymentNo}/files/{filename}` | serve_file_api | — (view only) |
| 9 | `POST` | `/finance/prepayments/{paymentNo}/files` | upload_file_api | L2 btn_prepay_upload_file |
| 10 | `DELETE` | `/finance/prepayments/{paymentNo}/files/{filename}` | delete_file_api | L2 btn_prepay_delete_file |
| 11 | `GET` | `/finance/exchange-rate` | rate_api | — (view only) |

---

## D6: ETL 数据迁移方案

### 来源表
- `in_pmt_prepay` (mutation log) — 所有历史行
- `in_pmt_prepay_final` (当前快照) — 每个 tran_num 最新状态

### 目标表
- `payments` — 每个 tran_num 的**最新状态** (来自 `_final`)
- `payment_events` — 每个 tran_num 的**完整历史** (来自 `in_pmt_prepay` 全部行)

### ETL 规则
1. `in_pmt_prepay_final` 每行 → `payments` 一行 (`payment_type='prepay'`)
2. `in_pmt_prepay` 按 `tran_num` 分组，每行 → `payment_events` 一行
3. `tran_type='in'` + `tran_ops='new'` → `prepay_tran_type='deposit'`, event_type='CREATE'
4. `tran_type='out'` → `prepay_tran_type='usage'`, event_type='CREATE' (PO/定金抵扣)
5. `tran_ops='adjust'` + `tran_amount=0` → event_type='DELETE'
6. `tran_ops='adjust'` + `tran_amount>0` (after DELETE) → event_type='RESTORE'
7. `supplier_code` → 通过 `suppliers` 表查找 `supplier_id`
8. 所有金额、汇率精度保持不变（不做四舍五入）

---

## D7: 逐功能验证 Checklist

- [ ] 供应商余额列表：与 V1 数据完全一致
- [ ] 交易明细列表：running_balance 计算正确
- [ ] 日期筛选：beginning_balance + filtered transactions
- [ ] 新增充值向导：4步、流水号生成规则一致
- [ ] 货币转换逻辑：USD↔RMB 方向正确
- [ ] 软删除/恢复：状态切换正确
- [ ] 历史三栏：左栏策略 / 中栏汇率 / 右栏金额
- [ ] 文件管理：上传/下载/HEIC转换/版本号
- [ ] 权限验证：5 个 Action Key 全部注册
- [ ] i18n：中英文 100% 覆盖
- [ ] ETL：V1 数据零丢失验证
