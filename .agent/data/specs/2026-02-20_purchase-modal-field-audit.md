# Purchase Modal Field-Level Audit: V1 vs V3

> Date: 2026-02-20
> Scope: All Create/Edit modals in Purchase module
> Source of Truth: V1 KI artifacts (po/backend.md, po/edit_wizard.md, send/backend.md, supplier/backend.md, supplier/frontend.md)

---

## 1. CreatePOModal (新建采购订单)

### V1 Create PO Fields (from po/backend.md L112-131)

| 字段 | V1 来源 | V3 状态 | 说明 |
|------|---------|---------|------|
| `supplier_code` | ✅ 必填 | ✅ dropdown 选择 | OK |
| `po_date` | ✅ 必填 | ✅ date input | OK |
| `currency` | ✅ 策略+custom | ✅ useOriginal/useCustom toggle | OK |
| `exchange_rate` | ✅ 必填 | ✅ auto/manual 3-source cascade | OK |
| `cur_mode` | ✅ A/M | ✅ rateMode state | OK |
| `float_enabled` | ❌ 可选 | ✅ toggle | OK |
| `float_threshold` | 条件必填 | ✅ 条件显示 | OK |
| `deposit_required` | ❌ 可选 | ✅ toggle | OK |
| `deposit_percentage` | 条件必填 | ✅ 条件显示 | OK |
| `items[].sku` | ✅ 必填 | ✅ datalist from SKU API | OK |
| `items[].qty` | ✅ 正整数 | ✅ parseInt validation | OK |
| `items[].unit_price` | ✅ 正数 | ✅ parseFloat validation | OK |
| `items[].note` | V1: 自动写入 "原始订单" | ✅ 已移除输入框 (a1ce50e) | ✅ 修复完成 |
| `passwords/sec_code` | ✅ SecurityCodeDialog L3 | ✅ | OK |

### V1 Create PO Note Logic (po/backend.md L155-157)
- V1 写入时: `note = "原始订单"` (硬编码), `action = "new"`, `seq = "L01"`
- 用户**不**输入 note → 后端自动填
- V3 行为: ✅ 已移除 note 输入框，后端 auto-generate

### V1 Create PO Excel Logic
- **Template download**: ✅ authenticated fetch + client-side fallback
- **V1 format detection**: ✅ B1 = "Eaglestar Purchase Order Form"
- **Metadata validation**: ✅ C2(supplier), E2(date), G2/F2(currency) cross-check
- **Date serial normalization**: ✅ Excel serial → ISO date
- **Row parsing**: ✅ B5-B1004 (SKU), C(qty), D(price)
- **parseErrors**: ✅ 已修复 (eacde30)
- **Simple format fallback**: ✅ sheet_to_json col 0/1/2

---

## 2. Edit PO Modal (修改采购订单)

### V1 Edit PO Logic (from po/edit_wizard.md)

V1 是一个 6 步向导:
1. **修改策略**: 汇率、货币、定金 — 左(原值) vs 右(新值) 对比
2. **验证策略**: 参数校验 (汇率>0, 备注≠原备注)
3. **修改明细**: 数量、单价 — 可删除/新增 SKU
4. **验证商品**: SKU合并 + 验证
5. **修改预览**: summary + 密码验证
6. **完成**: 结果

### V1 Edit PO 关键规则
1. **强制备注**: 策略修改和明细修改 **各自** 需要 note，且不能等于 "原始订单"
2. **canModify 条件** (po/frontend.md L161-166):
   - `is_deleted === false`
   - `shipping_status !== 'partially_shipped'`
   - `shipping_status !== 'fully_shipped'`
3. **payload**: `strategy_modified: bool`, `items_modified: bool` → 可以只改策略或只改明细

### V3 Edit PO 当前状态
> ⚠️ **V3 尚无 EditPOModal**。当前 V3 的 PO 编辑功能在 `PODetailPanel.tsx` 中实现。
> 需要确认: 是否需要创建独立的 EditPOModal，还是保持 in-panel editing。

---

## 3. CreateShipmentModal (新建发货单)

### V1 Create Shipment Fields (from send/backend.md L109-135)

| 字段 | V1 来源 | V3 状态 | 说明 |
|------|---------|---------|------|
| `date_sent` | ✅ 必填 | ✅ date input | OK |
| `date_eta` | ❌ 可选 | ✅ date input | OK |
| `logistic_num` | ✅ 必填 | ✅ text input | OK |
| `pallets` | ❌ 可选 | ✅ number input | OK |
| `total_weight` | ✅ 必填 | ✅ number input | OK |
| `price_kg` | ✅ 必填 | ✅ number input | OK |
| `usd_rmb` | ✅ 必填 | ✅ auto/manual exchange rate | OK |
| `is_manual_rate` | ✅ | ✅ rateMode state | OK |
| `items[].po_num` | ✅ | ✅ from availablePos | OK |
| `items[].po_sku` | ✅ | ✅ from availablePos | OK |
| `items[].send_quantity` | ✅ 正整数 | ✅ sendQty field | OK |
| `items[].is_rounded` | ✅ Y/N | ✅ isRounded checkbox | OK |
| `items[].sku_note` | V1: 自动写入 | ✅ 已移除输入框 (a1ce50e) | ✅ 修复完成 |
| `note` (物流级) | V1: **无此字段** in create | ✅ 已移除 (a1ce50e) | ✅ 修复完成 |
| `passwords` | ✅ SecurityCodeDialog L3 | ✅ | OK |

### V1 Create Shipment Note Logic (send/backend.md L34, L54)
- `in_send.note`: V1 create 时写入 "新建发货单" (硬编码)
- `in_send_list.note`: V1 create 时写入 "新建明细" (硬编码)
- 用户**不**输入 note → 后端自动填
- V3 行为: ✅ 已移除 note 输入框

### V1 Create Shipment Excel Logic
- **Cell references**: ✅ C4(logisticNum), F4(pallets), I4(sentDate), C6(priceKg), F6(totalWeight), I6(etaDate)
- **Item parsing**: ✅ Row 9+, 10 empty rows = stop
- **Item fields**: ✅ D(SKU), C(poNum), E(ordered), F(shipped), G(remaining), H(sendQty), I(isRounded), J(note)
- **isRounded detection**: ✅ 是/YES/1/TRUE

---

## 4. EditShipmentModal (修改发货单)

### V1 Edit Shipment Logic (from send/backend.md L93, send/frontend.md L156-166)

V1 分两个独立 API:
1. `POST /api/send_mgmt/edit_params/` → 修改物流参数 (weight/priceKg/eta/pallets/rate)
2. `POST /api/send_mgmt/edit_items/` → 修改货物明细

### V1 Edit Shipment 关键规则
1. **canModify 条件** (send/backend.md L208-214):
   - `receive_status === '货物在途中'` → ✅ can_modify
   - `全部已入库` / `差异:已解决` / `差异:未解决` → ❌ cannot modify
   - V3 实现: `status === 'IN_TRANSIT'` only → ✅ 正确
2. **Edit Params 强制备注**: V1 要求 note ≠ 原 note
3. **Edit Items**: 可修改 qty, 可删除, 可新增 — 都需 note

### V3 EditShipmentModal 当前状态

| 字段 | V1 可编辑 | V3 可编辑 | V3 hasChanges | 说明 |
|------|-----------|-----------|---------------|------|
| `etaDate` | ✅ | ✅ | ✅ | OK |
| `pallets` | ✅ | ✅ | ✅ | OK |
| `totalWeight` | ✅ | ✅ | ✅ | OK |
| `priceKg` | ✅ | ✅ | ✅ | OK |
| `exchangeRate` | ✅ | ✅ | ✅ | OK |
| `note` | ✅ 必填且≠原值 | ✅ 必填 | ✅ | ⚠️ 见下方 |
| `sentDate` | ❌ 不可编辑 | 只读 header | - | OK |
| `logisticNum` | ❌ 不可编辑 | 只读 header | - | OK |
| `items` | V1: 单独wizard | V3: 只读展示 | - | ⚠️ V3 缺 item 编辑 |

### ⚠️ V3 EditShipmentModal 差异

1. **Note 验证**: V1 要求 note ≠ 原始 note → V3 只检查 `note.trim()` 非空 → **不够严格**
   - 建议: 添加 `note !== shipment.note` 到 isValid 或至少到 hasChanges (已做)
2. **Items 编辑**: V1 有独立的 edit_items 向导 → V3 只有 params 编辑，无 item 编辑
   - 这可能是有意的设计选择（item 编辑通过别的入口）

### V3 hasChanges 逻辑审查 ✅

```typescript
hasChanges = (
  etaDate !== (shipment.etaDate || '') ||
  pallets !== (shipment.pallets || 0) ||
  Math.abs(totalWeight - (shipment.totalWeight || 0)) > 0.01 ||
  Math.abs(priceKg - (shipment.priceKg || 0)) > 0.0001 ||
  Math.abs(exchangeRate - (shipment.exchangeRate || 0)) > 0.0001 ||
  note !== (shipment.note || '')
)
```
- ✅ 使用 epsilon 比较 float 字段
- ✅ 所有可编辑字段都参与检测
- ✅ canSubmit = isValid && hasChanges && !isDisabled

---

## 5. AddSupplierModal (新增供应商)

### V1 Add Supplier Fields (from supplier/backend.md L106-121)

| 字段 | V1 来源 | V3 状态 | 说明 |
|------|---------|---------|------|
| `supplier_code` | ✅ 2位大写字母 | ✅ input + toUpperCase + code-exists check | OK |
| `supplier_name` | ✅ 必填 | ✅ input | OK |
| `category` | ✅ E/A radio | ✅ radio buttons | OK |
| `type` | ✅ A/B/C radio | ✅ radio buttons | OK |
| `currency` | ✅ RMB/USD radio | ✅ toggle | OK |
| `float_currency` | ❌ checkbox | ✅ toggle | OK |
| `float_threshold` | 条件必填 (0-10) | ✅ 条件显示 | OK |
| `depository` | ❌ checkbox | ✅ toggle | OK |
| `deposit_par` | 条件必填 (0-100) | ✅ 条件显示 | OK |
| `sec_code` | ✅ SecurityCodeDialog | ✅ | OK |

### V1 Add Supplier 验证规则 (supplier/frontend.md L111-149)
1. Code 格式: `/^[A-Z]{2}$/` → ✅ V3 实时检查
2. Code 唯一性: `GET /api/supplier/code-exists/` → ✅ V3 async debounce check
3. Float 条件: 启用时 threshold > 0 且 ≤ 10 → ✅ V3 inline validation
4. Deposit 条件: 启用时 ratio > 0 → ✅ V3 inline validation

### V1 Add Supplier Note Logic
- V1: `note = "默认策略"` (硬编码) → 后端自动
- V3: 无 note 字段 → ✅ 正确

---

## 6. Edit Supplier Strategy (修改供应商策略)

### V3 当前实现
> 修改策略不是通过独立 Modal，而是在 SupplierDetailPanel 中实现。
> 严格逻辑需参考 V1 的日期冲突处理和覆盖确认机制。

---

## 总结: 需要修复的问题

### ✅ 已修复
| # | 问题 | 修复 commit |
|---|------|------------|
| 1 | CreatePO parseErrors 丢失 | eacde30 |
| 2 | CreatePO/Shipment Note 输入框应移除 | a1ce50e |

### ⚠️ 待确认
| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 1 | EditShipment note 验证: V1 要求 ≠ 原 note | 低 — hasChanges 已检测 | 可保持现状 |
| 2 | EditShipment items 编辑: V1 有独立 wizard | 功能缺失 | 需确认是否需要 |
| 3 | EditPO: V3 无独立 Modal | 功能差异 | 需确认设计方向 |
