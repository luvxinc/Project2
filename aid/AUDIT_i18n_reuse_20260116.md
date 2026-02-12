# i18n 翻译键复用审计报告
# i18n Translation Key Reuse Audit Report

**生成时间 / Generated**: 2026-01-16 03:28
**分析文件 / Analyzed**: zh.json

---

## 执行摘要 / Executive Summary

| 指标 / Metric | 数值 / Value |
|---------------|--------------|
| 总键数 / Total Keys | 5033 |
| 重复值组数 / Duplicate Groups | 768 |
| 可复用键数 / Reusable Keys | 1968 |
| 节省潜力 / Saving Potential | **39.1%** |

---

## 问题说明 / Issue Description

以下翻译值在多个不同的键中重复出现。应该统一使用一个规范的键（通常在 `common.*` 命名空间中），
其他位置引用该键，而不是创建新的键。

The following translation values appear multiple times under different keys. 
A canonical key (typically in `common.*` namespace) should be used, 
with other locations referencing that key.

---

## 推荐的规范键 / Recommended Canonical Keys

以下是应该被复用的规范键（按复用潜力排序）：

| 翻译值 / Value | 复用次数 / Count | 推荐规范键 / Canonical Key |
|----------------|------------------|---------------------------|
| 操作须知 | 38 | `common.operation_notes` |
| 返回列表 | 37 | `common.back_list` |
| 取消 | 31 | `common.cancel` |
| 结算汇率 | 28 | `purchase.settlement_rate` |
| 单价 | 27 | `common.unit_price` |
| 返回 | 25 | `common.back` |
| 返回修改 | 23 | `common.back_modify` |
| 额外费用 | 22 | `purchase.extra_fee` |
| 订单号 | 19 | `purchase.order_num` |
| 操作 | 18 | `common.operation` |
| 订单日期 | 18 | `purchase.order_date` |
| 发货数量 | 18 | `purchase.shipping_qty` |
| 订单总金额 | 17 | `purchase.total_amount` |
| 下一步 | 16 | `common.next` |
| 备注 | 16 | `common.remark` |
| 物流单号 | 16 | `purchase.logistics_no` |
| 操作人 | 15 | `common.operator` |
| 数量 | 15 | `common.quantity` |
| 货币 | 15 | `common.currency` |
| 发货日期 | 14 | `purchase.shipping_date` |
| 本次支付 | 14 | `finance.this_payment` |
| 返回上一步 | 13 | `common.back_prev` |
| 上一步 | 13 | `common.prev` |
| 已付定金 | 13 | `purchase.deposit_paid` |
| 付款日期 | 13 | `finance.payment_date` |
| 网络错误: ${err} | 13 | `ui.text_490` |
| 操作说明 | 12 | `common.operation_desc` |
| 可选 | 12 | `common.optional` |
| 托盘数 | 12 | `js.pallets` |
| 订单级策略 | 12 | `ui.text_855` |
| 供应商 | 11 | `common.supplier` |
| 尾款剩余 | 11 | `purchase.balance_due` |
| 完成 | 11 | `etl.step_done` |
| 订货单号 | 11 | `table.order_no` |
| 定金比例 | 11 | `table.deposit_rate` |
| 入库数量 | 11 | `table.received_qty` |
| 无变更 | 10 | `common.no_change` |
| 小计 | 10 | `common.subtotal` |
| 价格浮动 | 10 | `purchase.price_float` |
| 自动获取 | 10 | `js.auto_fetch` |
| 物流单号: - | 10 | `ui.text_418` |
| 已删除 | 9 | `common.deleted` |
| 历史记录 | 9 | `common.history` |
| 确认入库 | 9 | `js.confirm_receiving` |
| 手动填写 | 9 | `ui.text_882` |
| 验证失败 | 8 | `modal.password.verify_failed` |
| 上传失败 | 8 | `toast.upload_failed` |
| 删除 | 8 | `common.delete` |
| 正在加载订单数据... | 8 | `purchase.loading_orders` |
| 定金要求 | 8 | `purchase.deposit_req` |
| 请返回上一步修正错误后再继续 | 8 | `shipping.return_to_fix` |
| 注意事项 | 8 | `ui.icon_3050` |
| 处理中... | 8 | `ui.text_229` |
| 修订日期 | 8 | `ui.text_2147` |
| 原策略 | 8 | `ui.text_654` |
| 正在加载历史记录... | 8 | `ui.text_707` |
| 本次抵扣 | 8 | `ui.text_2538` |
| 确认修改 | 7 | `modal.change_password.btn_confirm` |
| 状态 | 7 | `common.status` |
| 排序方式 | 7 | `purchase.sort_by` |
| 入库日期 | 7 | `purchase.receive_date` |
| 付款单号 | 7 | `table.pmt_no` |
| 汇率 | 7 | `table.exchange_rate` |
| 手动输入 | 7 | `js.mode_manual` |
| 合计: | 7 | `js.total_label` |
| 结算货币 | 7 | `js.settlement_currency` |
| 入库 | 7 | `ui.text_2005` |
| 未启用 | 7 | `ui.text_390` |
| 历史修订记录 | 7 | `ui.text_417` |
| 修订 | 7 | `ui.text_714` |
| 原信息 | 7 | `ui.text_2407` |
| 预付抵扣 | 7 | `ui.text_2484` |
| 无实质变更 | 7 | `ui.text_2629` |
| 操作失败 | 6 | `modal.error.title` |
| 确认删除 | 6 | `modal.confirm_delete.title` |
| 失败 | 6 | `toast.failed` |
| 关闭 | 6 | `common.close` |
| 全选 | 6 | `common.select_all` |
| 修改备注 | 6 | `common.modify_note` |
| 返回采购板块 | 6 | `purchase.back_to_hub` |

---

## 详细重复列表 / Detailed Duplicate List

以下按重复次数列出所有重复的翻译，并标记推荐保留的规范键：

### "操作须知" (38 keys)

**推荐规范键 / Canonical**: `common.operation_notes`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.operation_notes` | ✅ 保留 / Keep |
| `capability.guide_title` | 🔄 改用规范键 / Use canonical |
| `shipping.step1_title` | 🔄 改用规范键 / Use canonical |
| `ui.text_80` | 🔄 改用规范键 / Use canonical |
| `ui.text_87` | 🔄 改用规范键 / Use canonical |
| `ui.text_113` | 🔄 改用规范键 / Use canonical |
| `ui.text_128` | 🔄 改用规范键 / Use canonical |
| `ui.text_206` | 🔄 改用规范键 / Use canonical |
| `ui.text_322` | 🔄 改用规范键 / Use canonical |
| `ui.text_428` | 🔄 改用规范键 / Use canonical |
| `ui.text_459` | 🔄 改用规范键 / Use canonical |
| `ui.text_474` | 🔄 改用规范键 / Use canonical |
| `ui.text_478` | 🔄 改用规范键 / Use canonical |
| `ui.text_501` | 🔄 改用规范键 / Use canonical |
| `ui.text_520` | 🔄 改用规范键 / Use canonical |
| ... | *还有 23 个* |

### "返回列表" (37 keys)

**推荐规范键 / Canonical**: `common.back_list`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.back_list` | ✅ 保留 / Keep |
| `common.back_to_list` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3044` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3055` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3058` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3128` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3136` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3138` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3160` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3163` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3171` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3178` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3200` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3204` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3209` | 🔄 改用规范键 / Use canonical |
| ... | *还有 22 个* |

### "取消" (31 keys)

**推荐规范键 / Canonical**: `common.cancel`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `modal.btn.cancel` | 🔄 改用规范键 / Use canonical |
| `common.cancel` | ✅ 保留 / Keep |
| `js.cancel` | 🔄 改用规范键 / Use canonical |
| `ui.text_23` | 🔄 改用规范键 / Use canonical |
| `ui.text_65` | 🔄 改用规范键 / Use canonical |
| `ui.text_68` | 🔄 改用规范键 / Use canonical |
| `ui.text_69` | 🔄 改用规范键 / Use canonical |
| `ui.text_73` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3039` | 🔄 改用规范键 / Use canonical |
| `ui.text_109` | 🔄 改用规范键 / Use canonical |
| `ui.text_223` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3097` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3099` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3113` | 🔄 改用规范键 / Use canonical |
| `ui.text_285` | 🔄 改用规范键 / Use canonical |
| ... | *还有 16 个* |

### "结算汇率" (28 keys)

**推荐规范键 / Canonical**: `purchase.settlement_rate`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.settlement_rate` | ✅ 保留 / Keep |
| `table.settlement_rate` | 🔄 改用规范键 / Use canonical |
| `js.settlement_rate` | 🔄 改用规范键 / Use canonical |
| `ui.text_2212` | 🔄 改用规范键 / Use canonical |
| `ui.text_2234` | 🔄 改用规范键 / Use canonical |
| `ui.text_2246` | 🔄 改用规范键 / Use canonical |
| `ui.text_2364` | 🔄 改用规范键 / Use canonical |
| `ui.text_2379` | 🔄 改用规范键 / Use canonical |
| `ui.text_2454` | 🔄 改用规范键 / Use canonical |
| `ui.text_2483` | 🔄 改用规范键 / Use canonical |
| `ui.text_2505` | 🔄 改用规范键 / Use canonical |
| `ui.text_1257` | 🔄 改用规范键 / Use canonical |
| `ui.text_2517` | 🔄 改用规范键 / Use canonical |
| `ui.text_2524` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3391` | 🔄 改用规范键 / Use canonical |
| ... | *还有 13 个* |

### "单价" (27 keys)

**推荐规范键 / Canonical**: `common.unit_price`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.unit_price` | ✅ 保留 / Keep |
| `table.unit_price` | 🔄 改用规范键 / Use canonical |
| `js.price_placeholder` | 🔄 改用规范键 / Use canonical |
| `js.column_price` | 🔄 改用规范键 / Use canonical |
| `ui.text_2094` | 🔄 改用规范键 / Use canonical |
| `ui.text_2102` | 🔄 改用规范键 / Use canonical |
| `ui.text_2106` | 🔄 改用规范键 / Use canonical |
| `ui.text_2111` | 🔄 改用规范键 / Use canonical |
| `ui.text_2116` | 🔄 改用规范键 / Use canonical |
| `ui.text_2118` | 🔄 改用规范键 / Use canonical |
| `ui.text_2201` | 🔄 改用规范键 / Use canonical |
| `ui.text_2222` | 🔄 改用规范键 / Use canonical |
| `ui.text_667` | 🔄 改用规范键 / Use canonical |
| `ui.text_2259` | 🔄 改用规范键 / Use canonical |
| `ui.text_2346` | 🔄 改用规范键 / Use canonical |
| ... | *还有 12 个* |

### "返回" (25 keys)

**推荐规范键 / Canonical**: `common.back`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.back` | ✅ 保留 / Keep |
| `ui.icon_3189` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3191` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3193` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3240` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3259` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3269` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3274` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3282` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3302` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3308` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3325` | 🔄 改用规范键 / Use canonical |
| `ui.text_1293` | 🔄 改用规范键 / Use canonical |
| `ui.text_1295` | 🔄 改用规范键 / Use canonical |
| `ui.text_1299` | 🔄 改用规范键 / Use canonical |
| ... | *还有 10 个* |

### "返回修改" (23 keys)

**推荐规范键 / Canonical**: `common.back_modify`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.back_modify` | ✅ 保留 / Keep |
| `products.go_back` | 🔄 改用规范键 / Use canonical |
| `shipping.back_to_modify` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3019` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3064` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3073` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3169` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3181` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3213` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3237` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3262` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3265` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3277` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3284` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3290` | 🔄 改用规范键 / Use canonical |
| ... | *还有 8 个* |

### "额外费用" (22 keys)

**推荐规范键 / Canonical**: `purchase.extra_fee`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.extra_fee` | ✅ 保留 / Keep |
| `finance.extra_fees` | 🔄 改用规范键 / Use canonical |
| `table.extra_fees` | 🔄 改用规范键 / Use canonical |
| `ui.text_2468` | 🔄 改用规范键 / Use canonical |
| `ui.text_2486` | 🔄 改用规范键 / Use canonical |
| `ui.text_1230` | 🔄 改用规范键 / Use canonical |
| `ui.text_1255` | 🔄 改用规范键 / Use canonical |
| `ui.text_1307` | 🔄 改用规范键 / Use canonical |
| `ui.text_1313` | 🔄 改用规范键 / Use canonical |
| `ui.text_1333` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3396` | 🔄 改用规范键 / Use canonical |
| `ui.text_1352` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3407` | 🔄 改用规范键 / Use canonical |
| `ui.text_2577` | 🔄 改用规范键 / Use canonical |
| `ui.text_2590` | 🔄 改用规范键 / Use canonical |
| ... | *还有 7 个* |

### "订单号" (19 keys)

**推荐规范键 / Canonical**: `purchase.order_num`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.order_num` | ✅ 保留 / Keep |
| `finance.order_no` | 🔄 改用规范键 / Use canonical |
| `js.order_no` | 🔄 改用规范键 / Use canonical |
| `ui.text_231` | 🔄 改用规范键 / Use canonical |
| `ui.text_2153` | 🔄 改用规范键 / Use canonical |
| `ui.text_2178` | 🔄 改用规范键 / Use canonical |
| `ui.text_2193` | 🔄 改用规范键 / Use canonical |
| `ui.text_2206` | 🔄 改用规范键 / Use canonical |
| `ui.text_2288` | 🔄 改用规范键 / Use canonical |
| `ui.text_2293` | 🔄 改用规范键 / Use canonical |
| `ui.text_2297` | 🔄 改用规范键 / Use canonical |
| `ui.text_2305` | 🔄 改用规范键 / Use canonical |
| `ui.text_2323` | 🔄 改用规范键 / Use canonical |
| `ui.text_2330` | 🔄 改用规范键 / Use canonical |
| `ui.text_2367` | 🔄 改用规范键 / Use canonical |
| ... | *还有 4 个* |

### "操作" (18 keys)

**推荐规范键 / Canonical**: `common.operation`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.operation` | ✅ 保留 / Keep |
| `finance.action` | 🔄 改用规范键 / Use canonical |
| `log.table.action` | 🔄 改用规范键 / Use canonical |
| `table.actions` | 🔄 改用规范键 / Use canonical |
| `ui.text_2009` | 🔄 改用规范键 / Use canonical |
| `ui.text_2033` | 🔄 改用规范键 / Use canonical |
| `ui.text_2038` | 🔄 改用规范键 / Use canonical |
| `ui.text_2045` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3076` | 🔄 改用规范键 / Use canonical |
| `ui.text_2089` | 🔄 改用规范键 / Use canonical |
| `ui.text_2138` | 🔄 改用规范键 / Use canonical |
| `ui.text_2172` | 🔄 改用规范键 / Use canonical |
| `ui.text_2227` | 🔄 改用规范键 / Use canonical |
| `ui.text_2339` | 🔄 改用规范键 / Use canonical |
| `ui.text_2351` | 🔄 改用规范键 / Use canonical |
| ... | *还有 3 个* |

### "订单日期" (18 keys)

**推荐规范键 / Canonical**: `purchase.order_date`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.order_date` | ✅ 保留 / Keep |
| `finance.order_date` | 🔄 改用规范键 / Use canonical |
| `table.order_date` | 🔄 改用规范键 / Use canonical |
| `form.label.order_date` | 🔄 改用规范键 / Use canonical |
| `ui.text_846` | 🔄 改用规范键 / Use canonical |
| `ui.text_2419` | 🔄 改用规范键 / Use canonical |
| `ui.text_2429` | 🔄 改用规范键 / Use canonical |
| `ui.text_2437` | 🔄 改用规范键 / Use canonical |
| `ui.text_2452` | 🔄 改用规范键 / Use canonical |
| `ui.text_2472` | 🔄 改用规范键 / Use canonical |
| `ui.text_2543` | 🔄 改用规范键 / Use canonical |
| `ui.text_2560` | 🔄 改用规范键 / Use canonical |
| `ui.text_2586` | 🔄 改用规范键 / Use canonical |
| `ui.text_2602` | 🔄 改用规范键 / Use canonical |
| `ui.text_2651` | 🔄 改用规范键 / Use canonical |
| ... | *还有 3 个* |

### "发货数量" (18 keys)

**推荐规范键 / Canonical**: `purchase.shipping_qty`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.shipping_qty` | ✅ 保留 / Keep |
| `table.shipped_qty` | 🔄 改用规范键 / Use canonical |
| `ui.text_2096` | 🔄 改用规范键 / Use canonical |
| `ui.text_2104` | 🔄 改用规范键 / Use canonical |
| `ui.text_2108` | 🔄 改用规范键 / Use canonical |
| `ui.text_2113` | 🔄 改用规范键 / Use canonical |
| `ui.text_2120` | 🔄 改用规范键 / Use canonical |
| `ui.text_2123` | 🔄 改用规范键 / Use canonical |
| `ui.text_2179` | 🔄 改用规范键 / Use canonical |
| `ui.text_2187` | 🔄 改用规范键 / Use canonical |
| `ui.text_757` | 🔄 改用规范键 / Use canonical |
| `ui.text_2289` | 🔄 改用规范键 / Use canonical |
| `ui.text_2294` | 🔄 改用规范键 / Use canonical |
| `ui.text_2306` | 🔄 改用规范键 / Use canonical |
| `ui.text_2331` | 🔄 改用规范键 / Use canonical |
| ... | *还有 3 个* |

### "订单总金额" (17 keys)

**推荐规范键 / Canonical**: `purchase.total_amount`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.total_amount` | ✅ 保留 / Keep |
| `finance.order_total` | 🔄 改用规范键 / Use canonical |
| `table.total_amount` | 🔄 改用规范键 / Use canonical |
| `ui.text_900` | 🔄 改用规范键 / Use canonical |
| `ui.text_921` | 🔄 改用规范键 / Use canonical |
| `ui.text_2453` | 🔄 改用规范键 / Use canonical |
| `ui.text_2474` | 🔄 改用规范键 / Use canonical |
| `ui.text_2553` | 🔄 改用规范键 / Use canonical |
| `ui.text_2563` | 🔄 改用规范键 / Use canonical |
| `ui.text_2587` | 🔄 改用规范键 / Use canonical |
| `ui.text_2603` | 🔄 改用规范键 / Use canonical |
| `ui.text_1450` | 🔄 改用规范键 / Use canonical |
| `ui.text_2680` | 🔄 改用规范键 / Use canonical |
| `ui.text_2686` | 🔄 改用规范键 / Use canonical |
| `ui.text_2688` | 🔄 改用规范键 / Use canonical |
| ... | *还有 2 个* |

### "下一步" (16 keys)

**推荐规范键 / Canonical**: `common.next`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.next` | ✅ 保留 / Keep |
| `ui.icon_3190` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3197` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3210` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3217` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3220` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3270` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3305` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3309` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3320` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3322` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3343` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3347` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3351` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3354` | 🔄 改用规范键 / Use canonical |
| ... | *还有 1 个* |

### "备注" (16 keys)

**推荐规范键 / Canonical**: `common.remark`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.remark` | ✅ 保留 / Keep |
| `common.note` | 🔄 改用规范键 / Use canonical |
| `finance.note` | 🔄 改用规范键 / Use canonical |
| `table.remarks` | 🔄 改用规范键 / Use canonical |
| `js.remark` | 🔄 改用规范键 / Use canonical |
| `ui.text_2122` | 🔄 改用规范键 / Use canonical |
| `ui.text_2148` | 🔄 改用规范键 / Use canonical |
| `ui.text_2152` | 🔄 改用规范键 / Use canonical |
| `ui.text_2210` | 🔄 改用规范键 / Use canonical |
| `ui.text_2218` | 🔄 改用规范键 / Use canonical |
| `ui.text_2274` | 🔄 改用规范键 / Use canonical |
| `ui.text_2318` | 🔄 改用规范键 / Use canonical |
| `ui.text_2322` | 🔄 改用规范键 / Use canonical |
| `ui.text_2383` | 🔄 改用规范键 / Use canonical |
| `ui.text_2387` | 🔄 改用规范键 / Use canonical |
| ... | *还有 1 个* |

### "物流单号" (16 keys)

**推荐规范键 / Canonical**: `purchase.logistics_no`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.logistics_no` | ✅ 保留 / Keep |
| `table.logistics_no` | 🔄 改用规范键 / Use canonical |
| `js.logistics_no` | 🔄 改用规范键 / Use canonical |
| `ui.text_2099` | 🔄 改用规范键 / Use canonical |
| `ui.text_2139` | 🔄 改用规范键 / Use canonical |
| `ui.text_2285` | 🔄 改用规范键 / Use canonical |
| `ui.text_2309` | 🔄 改用规范键 / Use canonical |
| `ui.text_2327` | 🔄 改用规范键 / Use canonical |
| `ui.text_2357` | 🔄 改用规范键 / Use canonical |
| `ui.text_2372` | 🔄 改用规范键 / Use canonical |
| `ui.text_2499` | 🔄 改用规范键 / Use canonical |
| `ui.text_1252` | 🔄 改用规范键 / Use canonical |
| `ui.text_2513` | 🔄 改用规范键 / Use canonical |
| `ui.text_2612` | 🔄 改用规范键 / Use canonical |
| `ui.text_2664` | 🔄 改用规范键 / Use canonical |
| ... | *还有 1 个* |

### "操作人" (15 keys)

**推荐规范键 / Canonical**: `common.operator`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.operator` | ✅ 保留 / Keep |
| `finance.operator` | 🔄 改用规范键 / Use canonical |
| `ui.text_2146` | 🔄 改用规范键 / Use canonical |
| `ui.text_2150` | 🔄 改用规范键 / Use canonical |
| `ui.text_2208` | 🔄 改用规范键 / Use canonical |
| `ui.text_2216` | 🔄 改用规范键 / Use canonical |
| `ui.text_2303` | 🔄 改用规范键 / Use canonical |
| `ui.text_2316` | 🔄 改用规范键 / Use canonical |
| `ui.text_2320` | 🔄 改用规范键 / Use canonical |
| `ui.text_2366` | 🔄 改用规范键 / Use canonical |
| `ui.text_2381` | 🔄 改用规范键 / Use canonical |
| `ui.text_2385` | 🔄 改用规范键 / Use canonical |
| `ui.text_1448` | 🔄 改用规范键 / Use canonical |
| `ui.text_1457` | 🔄 改用规范键 / Use canonical |
| `ui.text_1549` | 🔄 改用规范键 / Use canonical |

### "数量" (15 keys)

**推荐规范键 / Canonical**: `common.quantity`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.quantity` | ✅ 保留 / Keep |
| `js.qty_placeholder` | 🔄 改用规范键 / Use canonical |
| `js.column_qty` | 🔄 改用规范键 / Use canonical |
| `ui.text_2200` | 🔄 改用规范键 / Use canonical |
| `ui.text_2220` | 🔄 改用规范键 / Use canonical |
| `ui.text_666` | 🔄 改用规范键 / Use canonical |
| `ui.text_2230` | 🔄 改用规范键 / Use canonical |
| `ui.text_2258` | 🔄 改用规范键 / Use canonical |
| `ui.text_2345` | 🔄 改用规范键 / Use canonical |
| `ui.text_2348` | 🔄 改用规范键 / Use canonical |
| `ui.text_2404` | 🔄 改用规范键 / Use canonical |
| `ui.text_2496` | 🔄 改用规范键 / Use canonical |
| `ui.text_2531` | 🔄 改用规范键 / Use canonical |
| `ui.text_2580` | 🔄 改用规范键 / Use canonical |
| `ui.text_2720` | 🔄 改用规范键 / Use canonical |

### "货币" (15 keys)

**推荐规范键 / Canonical**: `common.currency`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.currency` | ✅ 保留 / Keep |
| `purchase.currency` | 🔄 改用规范键 / Use canonical |
| `ui.text_432` | 🔄 改用规范键 / Use canonical |
| `ui.text_2132` | 🔄 改用规范键 / Use canonical |
| `ui.text_2162` | 🔄 改用规范键 / Use canonical |
| `ui.text_2196` | 🔄 改用规范键 / Use canonical |
| `ui.text_2211` | 🔄 改用规范键 / Use canonical |
| `ui.text_2221` | 🔄 改用规范键 / Use canonical |
| `ui.text_2253` | 🔄 改用规范键 / Use canonical |
| `ui.text_2391` | 🔄 改用规范键 / Use canonical |
| `ui.text_2420` | 🔄 改用规范键 / Use canonical |
| `ui.text_2438` | 🔄 改用规范键 / Use canonical |
| `ui.text_2532` | 🔄 改用规范键 / Use canonical |
| `ui.text_2581` | 🔄 改用规范键 / Use canonical |
| `ui.text_2721` | 🔄 改用规范键 / Use canonical |

### "发货日期" (14 keys)

**推荐规范键 / Canonical**: `purchase.shipping_date`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.shipping_date` | ✅ 保留 / Keep |
| `js.shipment_date` | 🔄 改用规范键 / Use canonical |
| `ui.text_2140` | 🔄 改用规范键 / Use canonical |
| `ui.text_2310` | 🔄 改用规范键 / Use canonical |
| `ui.text_2358` | 🔄 改用规范键 / Use canonical |
| `ui.text_2373` | 🔄 改用规范键 / Use canonical |
| `ui.text_2394` | 🔄 改用规范键 / Use canonical |
| `ui.text_2500` | 🔄 改用规范键 / Use canonical |
| `ui.text_2508` | 🔄 改用规范键 / Use canonical |
| `ui.text_2514` | 🔄 改用规范键 / Use canonical |
| `ui.text_2613` | 🔄 改用规范键 / Use canonical |
| `ui.text_2665` | 🔄 改用规范键 / Use canonical |
| `tooltip.t8535` | 🔄 改用规范键 / Use canonical |
| `desc.d104` | 🔄 改用规范键 / Use canonical |

### "本次支付" (14 keys)

**推荐规范键 / Canonical**: `finance.this_payment`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `finance.this_payment` | ✅ 保留 / Keep |
| `ui.text_2528` | 🔄 改用规范键 / Use canonical |
| `ui.text_2540` | 🔄 改用规范键 / Use canonical |
| `ui.text_2550` | 🔄 改用规范键 / Use canonical |
| `ui.text_2557` | 🔄 改用规范键 / Use canonical |
| `ui.text_2567` | 🔄 改用规范键 / Use canonical |
| `ui.text_1452` | 🔄 改用规范键 / Use canonical |
| `ui.text_2648` | 🔄 改用规范键 / Use canonical |
| `ui.text_2658` | 🔄 改用规范键 / Use canonical |
| `ui.text_1519` | 🔄 改用规范键 / Use canonical |
| `ui.text_1545` | 🔄 改用规范键 / Use canonical |
| `ui.text_2692` | 🔄 改用规范键 / Use canonical |
| `ui.text_2702` | 🔄 改用规范键 / Use canonical |
| `ui.text_2717` | 🔄 改用规范键 / Use canonical |

### "返回上一步" (13 keys)

**推荐规范键 / Canonical**: `common.back_prev`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.back_prev` | ✅ 保留 / Keep |
| `shipping.prev_step` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3139` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3141` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3142` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3150` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3152` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3154` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3304` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3315` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3321` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3352` | 🔄 改用规范键 / Use canonical |
| `tooltip.t2849` | 🔄 改用规范键 / Use canonical |

### "上一步" (13 keys)

**推荐规范键 / Canonical**: `common.prev`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.prev` | ✅ 保留 / Keep |
| `ui.icon_3134` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3216` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3219` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3221` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3228` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3231` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3385` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3399` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3410` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3424` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3433` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3449` | 🔄 改用规范键 / Use canonical |

### "已付定金" (13 keys)

**推荐规范键 / Canonical**: `purchase.deposit_paid`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.deposit_paid` | ✅ 保留 / Keep |
| `table.deposit_paid` | 🔄 改用规范键 / Use canonical |
| `ui.text_2457` | 🔄 改用规范键 / Use canonical |
| `ui.text_2477` | 🔄 改用规范键 / Use canonical |
| `ui.text_2537` | 🔄 改用规范键 / Use canonical |
| `ui.text_2547` | 🔄 改用规范键 / Use canonical |
| `ui.text_2588` | 🔄 改用规范键 / Use canonical |
| `ui.text_2607` | 🔄 改用规范键 / Use canonical |
| `ui.text_2610` | 🔄 改用规范键 / Use canonical |
| `ui.text_2645` | 🔄 改用规范键 / Use canonical |
| `ui.text_2655` | 🔄 改用规范键 / Use canonical |
| `ui.text_2683` | 🔄 改用规范键 / Use canonical |
| `ui.text_2740` | 🔄 改用规范键 / Use canonical |

### "付款日期" (13 keys)

**推荐规范键 / Canonical**: `finance.payment_date`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `finance.payment_date` | ✅ 保留 / Keep |
| `table.payment_date` | 🔄 改用规范键 / Use canonical |
| `ui.text_2463` | 🔄 改用规范键 / Use canonical |
| `ui.text_2482` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3375` | 🔄 改用规范键 / Use canonical |
| `ui.text_2525` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3389` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3400` | 🔄 改用规范键 / Use canonical |
| `ui.text_2574` | 🔄 改用规范键 / Use canonical |
| `ui.text_1447` | 🔄 改用规范键 / Use canonical |
| `ui.text_1456` | 🔄 改用规范键 / Use canonical |
| `ui.text_1548` | 🔄 改用规范键 / Use canonical |
| `ui.text_2714` | 🔄 改用规范键 / Use canonical |

### "网络错误: ${err}" (13 keys)

**推荐规范键 / Canonical**: `ui.text_490`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_490` | ✅ 保留 / Keep |
| `ui.text_550` | 🔄 改用规范键 / Use canonical |
| `ui.text_587` | 🔄 改用规范键 / Use canonical |
| `ui.text_711` | 🔄 改用规范键 / Use canonical |
| `ui.text_800` | 🔄 改用规范键 / Use canonical |
| `ui.text_1068` | 🔄 改用规范键 / Use canonical |
| `ui.text_1294` | 🔄 改用规范键 / Use canonical |
| `ui.text_1328` | 🔄 改用规范键 / Use canonical |
| `ui.text_1375` | 🔄 改用规范键 / Use canonical |
| `ui.text_1504` | 🔄 改用规范键 / Use canonical |
| `ui.text_1616` | 🔄 改用规范键 / Use canonical |
| `ui.text_1620` | 🔄 改用规范键 / Use canonical |
| `ui.text_1650` | 🔄 改用规范键 / Use canonical |

### "操作说明" (12 keys)

**推荐规范键 / Canonical**: `common.operation_desc`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.operation_desc` | ✅ 保留 / Keep |
| `ui.icon_3041` | 🔄 改用规范键 / Use canonical |
| `ui.text_159` | 🔄 改用规范键 / Use canonical |
| `ui.text_176` | 🔄 改用规范键 / Use canonical |
| `ui.text_193` | 🔄 改用规范键 / Use canonical |
| `ui.text_353` | 🔄 改用规范键 / Use canonical |
| `ui.text_588` | 🔄 改用规范键 / Use canonical |
| `ui.text_885` | 🔄 改用规范键 / Use canonical |
| `ui.text_950` | 🔄 改用规范键 / Use canonical |
| `ui.text_989` | 🔄 改用规范键 / Use canonical |
| `ui.text_1439` | 🔄 改用规范键 / Use canonical |
| `ui.text_1673` | 🔄 改用规范键 / Use canonical |

### "可选" (12 keys)

**推荐规范键 / Canonical**: `common.optional`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.optional` | ✅ 保留 / Keep |
| `ui.text_261` | 🔄 改用规范键 / Use canonical |
| `ui.text_603` | 🔄 改用规范键 / Use canonical |
| `ui.text_748` | 🔄 改用规范键 / Use canonical |
| `ui.text_790` | 🔄 改用规范键 / Use canonical |
| `ui.text_902` | 🔄 改用规范键 / Use canonical |
| `ui.text_923` | 🔄 改用规范键 / Use canonical |
| `ui.text_1007` | 🔄 改用规范键 / Use canonical |
| `ui.text_1418` | 🔄 改用规范键 / Use canonical |
| `ui.text_1498` | 🔄 改用规范键 / Use canonical |
| `ui.text_1521` | 🔄 改用规范键 / Use canonical |
| `ui.text_1602` | 🔄 改用规范键 / Use canonical |

### "托盘数" (12 keys)

**推荐规范键 / Canonical**: `js.pallets`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `js.pallets` | ✅ 保留 / Keep |
| `ui.text_2142` | 🔄 改用规范键 / Use canonical |
| `ui.text_2166` | 🔄 改用规范键 / Use canonical |
| `ui.text_2312` | 🔄 改用规范键 / Use canonical |
| `ui.text_2360` | 🔄 改用规范键 / Use canonical |
| `ui.text_2375` | 🔄 改用规范键 / Use canonical |
| `ui.text_2396` | 🔄 改用规范键 / Use canonical |
| `ui.text_2410` | 🔄 改用规范键 / Use canonical |
| `ui.text_2503` | 🔄 改用规范键 / Use canonical |
| `ui.text_2509` | 🔄 改用规范键 / Use canonical |
| `ui.text_2666` | 🔄 改用规范键 / Use canonical |
| `tooltip.t4630` | 🔄 改用规范键 / Use canonical |

### "订单级策略" (12 keys)

**推荐规范键 / Canonical**: `ui.text_855`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_855` | ✅ 保留 / Keep |
| `ui.text_856` | 🔄 改用规范键 / Use canonical |
| `ui.text_857` | 🔄 改用规范键 / Use canonical |
| `ui.text_858` | 🔄 改用规范键 / Use canonical |
| `ui.text_859` | 🔄 改用规范键 / Use canonical |
| `ui.text_860` | 🔄 改用规范键 / Use canonical |
| `ui.text_926` | 🔄 改用规范键 / Use canonical |
| `ui.text_927` | 🔄 改用规范键 / Use canonical |
| `ui.text_928` | 🔄 改用规范键 / Use canonical |
| `ui.text_929` | 🔄 改用规范键 / Use canonical |
| `ui.text_930` | 🔄 改用规范键 / Use canonical |
| `ui.text_931` | 🔄 改用规范键 / Use canonical |

### "供应商" (11 keys)

**推荐规范键 / Canonical**: `common.supplier`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.supplier` | ✅ 保留 / Keep |
| `purchase.supplier_col` | 🔄 改用规范键 / Use canonical |
| `table.supplier` | 🔄 改用规范键 / Use canonical |
| `ui.text_2194` | 🔄 改用规范键 / Use canonical |
| `ui.text_2204` | 🔄 改用规范键 / Use canonical |
| `ui.text_847` | 🔄 改用规范键 / Use canonical |
| `ui.text_1013` | 🔄 改用规范键 / Use canonical |
| `ui.text_1318` | 🔄 改用规范键 / Use canonical |
| `ui.text_2522` | 🔄 改用规范键 / Use canonical |
| `ui.text_2571` | 🔄 改用规范键 / Use canonical |
| `ui.text_2711` | 🔄 改用规范键 / Use canonical |

### "尾款剩余" (11 keys)

**推荐规范键 / Canonical**: `purchase.balance_due`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.balance_due` | ✅ 保留 / Keep |
| `table.balance_remaining` | 🔄 改用规范键 / Use canonical |
| `ui.text_2459` | 🔄 改用规范键 / Use canonical |
| `ui.text_2479` | 🔄 改用规范键 / Use canonical |
| `ui.text_2568` | 🔄 改用规范键 / Use canonical |
| `ui.text_1453` | 🔄 改用规范键 / Use canonical |
| `ui.text_1576` | 🔄 改用规范键 / Use canonical |
| `ui.text_2685` | 🔄 改用规范键 / Use canonical |
| `ui.text_2693` | 🔄 改用规范键 / Use canonical |
| `ui.text_2703` | 🔄 改用规范键 / Use canonical |
| `ui.text_2741` | 🔄 改用规范键 / Use canonical |

### "完成" (11 keys)

**推荐规范键 / Canonical**: `etl.step_done`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `etl.step_done` | ✅ 保留 / Keep |
| `shipping.step7_title` | 🔄 改用规范键 / Use canonical |
| `reports_gen.step_complete` | 🔄 改用规范键 / Use canonical |
| `wizard.done` | 🔄 改用规范键 / Use canonical |
| `wizard.po_done` | 🔄 改用规范键 / Use canonical |
| `wizard.send_done` | 🔄 改用规范键 / Use canonical |
| `js.complete` | 🔄 改用规范键 / Use canonical |
| `ui.text_2006` | 🔄 改用规范键 / Use canonical |
| `ui.text_2013` | 🔄 改用规范键 / Use canonical |
| `ui.text_1442` | 🔄 改用规范键 / Use canonical |
| `ui.text_2771` | 🔄 改用规范键 / Use canonical |

### "订货单号" (11 keys)

**推荐规范键 / Canonical**: `table.order_no`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `table.order_no` | ✅ 保留 / Keep |
| `ui.text_2451` | 🔄 改用规范键 / Use canonical |
| `ui.text_2471` | 🔄 改用规范键 / Use canonical |
| `ui.text_2542` | 🔄 改用规范键 / Use canonical |
| `ui.text_2559` | 🔄 改用规范键 / Use canonical |
| `ui.text_2585` | 🔄 改用规范键 / Use canonical |
| `ui.text_2601` | 🔄 改用规范键 / Use canonical |
| `ui.text_2650` | 🔄 改用规范键 / Use canonical |
| `ui.text_2678` | 🔄 改用规范键 / Use canonical |
| `ui.text_2694` | 🔄 改用规范键 / Use canonical |
| `ui.text_2732` | 🔄 改用规范键 / Use canonical |

### "定金比例" (11 keys)

**推荐规范键 / Canonical**: `table.deposit_rate`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `table.deposit_rate` | ✅ 保留 / Keep |
| `js.deposit_rate` | 🔄 改用规范键 / Use canonical |
| `ui.text_2242` | 🔄 改用规范键 / Use canonical |
| `ui.text_2250` | 🔄 改用规范键 / Use canonical |
| `ui.text_2455` | 🔄 改用规范键 / Use canonical |
| `ui.text_2526` | 🔄 改用规范键 / Use canonical |
| `ui.text_1405` | 🔄 改用规范键 / Use canonical |
| `ui.text_2605` | 🔄 改用规范键 / Use canonical |
| `ui.text_2715` | 🔄 改用规范键 / Use canonical |
| `ui.text_2737` | 🔄 改用规范键 / Use canonical |
| `desc.d138` | 🔄 改用规范键 / Use canonical |

### "入库数量" (11 keys)

**推荐规范键 / Canonical**: `table.received_qty`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `table.received_qty` | ✅ 保留 / Keep |
| `ui.text_2097` | 🔄 改用规范键 / Use canonical |
| `ui.text_2105` | 🔄 改用规范键 / Use canonical |
| `ui.text_2109` | 🔄 改用规范键 / Use canonical |
| `ui.text_2114` | 🔄 改用规范键 / Use canonical |
| `ui.text_2121` | 🔄 改用规范键 / Use canonical |
| `ui.text_2124` | 🔄 改用规范键 / Use canonical |
| `ui.text_2180` | 🔄 改用规范键 / Use canonical |
| `ui.text_2188` | 🔄 改用规范键 / Use canonical |
| `ui.text_2295` | 🔄 改用规范键 / Use canonical |
| `ui.text_2332` | 🔄 改用规范键 / Use canonical |

### "无变更" (10 keys)

**推荐规范键 / Canonical**: `common.no_change`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.no_change` | ✅ 保留 / Keep |
| `ui.text_2257` | 🔄 改用规范键 / Use canonical |
| `ui.text_2260` | 🔄 改用规范键 / Use canonical |
| `ui.text_2296` | 🔄 改用规范键 / Use canonical |
| `ui.text_2301` | 🔄 改用规范键 / Use canonical |
| `ui.text_2402` | 🔄 改用规范键 / Use canonical |
| `ui.text_2406` | 🔄 改用规范键 / Use canonical |
| `ui.text_2594` | 🔄 改用规范键 / Use canonical |
| `ui.text_2597` | 🔄 改用规范键 / Use canonical |
| `ui.text_2600` | 🔄 改用规范键 / Use canonical |

### "小计" (10 keys)

**推荐规范键 / Canonical**: `common.subtotal`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.subtotal` | ✅ 保留 / Keep |
| `js.column_subtotal` | 🔄 改用规范键 / Use canonical |
| `ui.text_2202` | 🔄 改用规范键 / Use canonical |
| `ui.text_2336` | 🔄 改用规范键 / Use canonical |
| `ui.text_2343` | 🔄 改用规范键 / Use canonical |
| `ui.text_2347` | 🔄 改用规范键 / Use canonical |
| `ui.text_2350` | 🔄 改用规范键 / Use canonical |
| `ui.text_2370` | 🔄 改用规范键 / Use canonical |
| `ui.subtotal` | 🔄 改用规范键 / Use canonical |
| `desc.d141` | 🔄 改用规范键 / Use canonical |

### "价格浮动" (10 keys)

**推荐规范键 / Canonical**: `purchase.price_float`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.price_float` | ✅ 保留 / Keep |
| `js.price_float` | 🔄 改用规范键 / Use canonical |
| `ui.text_2133` | 🔄 改用规范键 / Use canonical |
| `ui.text_2163` | 🔄 改用规范键 / Use canonical |
| `ui.text_2198` | 🔄 改用规范键 / Use canonical |
| `ui.text_2213` | 🔄 改用规范键 / Use canonical |
| `ui.text_2236` | 🔄 改用规范键 / Use canonical |
| `ui.text_2247` | 🔄 改用规范键 / Use canonical |
| `ui.text_2255` | 🔄 改用规范键 / Use canonical |
| `desc.d127` | 🔄 改用规范键 / Use canonical |

### "自动获取" (10 keys)

**推荐规范键 / Canonical**: `js.auto_fetch`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `js.auto_fetch` | ✅ 保留 / Keep |
| `js.rate_auto_badge` | 🔄 改用规范键 / Use canonical |
| `ui.text_1096` | 🔄 改用规范键 / Use canonical |
| `ui.text_1314` | 🔄 改用规范键 / Use canonical |
| `ui.text_1340` | 🔄 改用规范键 / Use canonical |
| `ui.text_1359` | 🔄 改用规范键 / Use canonical |
| `ui.text_1421` | 🔄 改用规范键 / Use canonical |
| `ui.text_1433` | 🔄 改用规范键 / Use canonical |
| `ui.text_1525` | 🔄 改用规范键 / Use canonical |
| `ui.text_1606` | 🔄 改用规范键 / Use canonical |

### "物流单号: -" (10 keys)

**推荐规范键 / Canonical**: `ui.text_418`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_418` | ✅ 保留 / Keep |
| `ui.text_492` | 🔄 改用规范键 / Use canonical |
| `ui.text_795` | 🔄 改用规范键 / Use canonical |
| `ui.text_820` | 🔄 改用规范键 / Use canonical |
| `ui.text_823` | 🔄 改用规范键 / Use canonical |
| `ui.text_831` | 🔄 改用规范键 / Use canonical |
| `ui.text_1037` | 🔄 改用规范键 / Use canonical |
| `ui.text_1052` | 🔄 改用规范键 / Use canonical |
| `ui.text_1056` | 🔄 改用规范键 / Use canonical |
| `ui.text_1063` | 🔄 改用规范键 / Use canonical |

### "已删除" (9 keys)

**推荐规范键 / Canonical**: `common.deleted`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `toast.deleted` | 🔄 改用规范键 / Use canonical |
| `common.deleted` | ✅ 保留 / Keep |
| `ui.text_690` | 🔄 改用规范键 / Use canonical |
| `ui.text_691` | 🔄 改用规范键 / Use canonical |
| `ui.text_693` | 🔄 改用规范键 / Use canonical |
| `ui.text_1476` | 🔄 改用规范键 / Use canonical |
| `ui.text_1482` | 🔄 改用规范键 / Use canonical |
| `ui.text_1565` | 🔄 改用规范键 / Use canonical |
| `ui.text_1643` | 🔄 改用规范键 / Use canonical |

### "历史记录" (9 keys)

**推荐规范键 / Canonical**: `common.history`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.history` | ✅ 保留 / Keep |
| `ui.text_409` | 🔄 改用规范键 / Use canonical |
| `ui.text_462` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3179` | 🔄 改用规范键 / Use canonical |
| `ui.text_523` | 🔄 改用规范键 / Use canonical |
| `ui.text_560` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3207` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3248` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3340` | 🔄 改用规范键 / Use canonical |

### "确认入库" (9 keys)

**推荐规范键 / Canonical**: `js.confirm_receiving`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `js.confirm_receiving` | ✅ 保留 / Keep |
| `ui.icon_3091` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3115` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3116` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3155` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3192` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3194` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3241` | 🔄 改用规范键 / Use canonical |
| `tooltip.t8451` | 🔄 改用规范键 / Use canonical |

### "手动填写" (9 keys)

**推荐规范键 / Canonical**: `ui.text_882`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_882` | ✅ 保留 / Keep |
| `ui.text_984` | 🔄 改用规范键 / Use canonical |
| `ui.text_1315` | 🔄 改用规范键 / Use canonical |
| `ui.text_1341` | 🔄 改用规范键 / Use canonical |
| `ui.text_1360` | 🔄 改用规范键 / Use canonical |
| `ui.text_1422` | 🔄 改用规范键 / Use canonical |
| `ui.text_1434` | 🔄 改用规范键 / Use canonical |
| `ui.text_1526` | 🔄 改用规范键 / Use canonical |
| `ui.text_1607` | 🔄 改用规范键 / Use canonical |

### "验证失败" (8 keys)

**推荐规范键 / Canonical**: `modal.password.verify_failed`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `modal.password.verify_failed` | ✅ 保留 / Keep |
| `validation.validation_failed` | 🔄 改用规范键 / Use canonical |
| `js.verify_failed` | 🔄 改用规范键 / Use canonical |
| `ui.text_164` | 🔄 改用规范键 / Use canonical |
| `ui.text_181` | 🔄 改用规范键 / Use canonical |
| `ui.text_198` | 🔄 改用规范键 / Use canonical |
| `ui.text_958` | 🔄 改用规范键 / Use canonical |
| `ui.text_1114` | 🔄 改用规范键 / Use canonical |

### "上传失败" (8 keys)

**推荐规范键 / Canonical**: `toast.upload_failed`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `toast.upload_failed` | ✅ 保留 / Keep |
| `file.upload_failed` | 🔄 改用规范键 / Use canonical |
| `ui.text_487` | 🔄 改用规范键 / Use canonical |
| `ui.text_489` | 🔄 改用规范键 / Use canonical |
| `ui.text_547` | 🔄 改用规范键 / Use canonical |
| `ui.text_549` | 🔄 改用规范键 / Use canonical |
| `ui.text_584` | 🔄 改用规范键 / Use canonical |
| `ui.text_586` | 🔄 改用规范键 / Use canonical |

### "删除" (8 keys)

**推荐规范键 / Canonical**: `common.delete`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.delete` | ✅ 保留 / Keep |
| `ui.text_724` | 🔄 改用规范键 / Use canonical |
| `ui.text_1077` | 🔄 改用规范键 / Use canonical |
| `ui.text_1104` | 🔄 改用规范键 / Use canonical |
| `ui.text_1132` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3380` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3397` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3408` | 🔄 改用规范键 / Use canonical |

### "正在加载订单数据..." (8 keys)

**推荐规范键 / Canonical**: `purchase.loading_orders`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.loading_orders` | ✅ 保留 / Keep |
| `ui.text_638` | 🔄 改用规范键 / Use canonical |
| `ui.text_643` | 🔄 改用规范键 / Use canonical |
| `ui.text_652` | 🔄 改用规范键 / Use canonical |
| `ui.text_1322` | 🔄 改用规范键 / Use canonical |
| `ui.text_1369` | 🔄 改用规范键 / Use canonical |
| `ui.text_1571` | 🔄 改用规范键 / Use canonical |
| `ui.text_1610` | 🔄 改用规范键 / Use canonical |

### "定金要求" (8 keys)

**推荐规范键 / Canonical**: `purchase.deposit_req`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.deposit_req` | ✅ 保留 / Keep |
| `js.deposit_required` | 🔄 改用规范键 / Use canonical |
| `ui.text_2134` | 🔄 改用规范键 / Use canonical |
| `ui.text_2164` | 🔄 改用规范键 / Use canonical |
| `ui.text_2199` | 🔄 改用规范键 / Use canonical |
| `ui.text_2214` | 🔄 改用规范键 / Use canonical |
| `ui.text_2240` | 🔄 改用规范键 / Use canonical |
| `ui.text_2256` | 🔄 改用规范键 / Use canonical |

### "请返回上一步修正错误后再继续" (8 keys)

**推荐规范键 / Canonical**: `shipping.return_to_fix`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `shipping.return_to_fix` | ✅ 保留 / Keep |
| `ui.icon_3212` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3261` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3264` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3276` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3292` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3318` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3345` | 🔄 改用规范键 / Use canonical |

### "注意事项" (8 keys)

**推荐规范键 / Canonical**: `ui.icon_3050`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.icon_3050` | ✅ 保留 / Keep |
| `ui.icon_3053` | 🔄 改用规范键 / Use canonical |
| `ui.text_414` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3196` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3287` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3296` | 🔄 改用规范键 / Use canonical |
| `ui.text_959` | 🔄 改用规范键 / Use canonical |
| `ui.text_1115` | 🔄 改用规范键 / Use canonical |

### "处理中..." (8 keys)

**推荐规范键 / Canonical**: `ui.text_229`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_229` | ✅ 保留 / Keep |
| `ui.text_636` | 🔄 改用规范键 / Use canonical |
| `ui.text_749` | 🔄 改用规范键 / Use canonical |
| `ui.text_842` | 🔄 改用规范键 / Use canonical |
| `ui.text_844` | 🔄 改用规范键 / Use canonical |
| `ui.text_862` | 🔄 改用规范键 / Use canonical |
| `ui.text_962` | 🔄 改用规范键 / Use canonical |
| `ui.text_1048` | 🔄 改用规范键 / Use canonical |

### "修订日期" (8 keys)

**推荐规范键 / Canonical**: `ui.text_2147`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_2147` | ✅ 保留 / Keep |
| `ui.text_2151` | 🔄 改用规范键 / Use canonical |
| `ui.text_2209` | 🔄 改用规范键 / Use canonical |
| `ui.text_2217` | 🔄 改用规范键 / Use canonical |
| `ui.text_2317` | 🔄 改用规范键 / Use canonical |
| `ui.text_2321` | 🔄 改用规范键 / Use canonical |
| `ui.text_2382` | 🔄 改用规范键 / Use canonical |
| `ui.text_2386` | 🔄 改用规范键 / Use canonical |

### "原策略" (8 keys)

**推荐规范键 / Canonical**: `ui.text_654`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_654` | ✅ 保留 / Keep |
| `ui.text_2224` | 🔄 改用规范键 / Use canonical |
| `ui.text_2233` | 🔄 改用规范键 / Use canonical |
| `ui.text_2235` | 🔄 改用规范键 / Use canonical |
| `ui.text_2237` | 🔄 改用规范键 / Use canonical |
| `ui.text_2239` | 🔄 改用规范键 / Use canonical |
| `ui.text_2241` | 🔄 改用规范键 / Use canonical |
| `ui.text_2243` | 🔄 改用规范键 / Use canonical |

### "正在加载历史记录..." (8 keys)

**推荐规范键 / Canonical**: `ui.text_707`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_707` | ✅ 保留 / Keep |
| `ui.text_796` | 🔄 改用规范键 / Use canonical |
| `ui.text_1064` | 🔄 改用规范键 / Use canonical |
| `ui.text_1385` | 🔄 改用规范键 / Use canonical |
| `ui.text_1463` | 🔄 改用规范键 / Use canonical |
| `ui.text_1529` | 🔄 改用规范键 / Use canonical |
| `ui.text_1552` | 🔄 改用规范键 / Use canonical |
| `ui.text_1630` | 🔄 改用规范键 / Use canonical |

### "本次抵扣" (8 keys)

**推荐规范键 / Canonical**: `ui.text_2538`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_2538` | ✅ 保留 / Keep |
| `ui.text_2548` | 🔄 改用规范键 / Use canonical |
| `ui.text_2555` | 🔄 改用规范键 / Use canonical |
| `ui.text_2565` | 🔄 改用规范键 / Use canonical |
| `ui.text_2646` | 🔄 改用规范键 / Use canonical |
| `ui.text_2656` | 🔄 改用规范键 / Use canonical |
| `ui.text_2690` | 🔄 改用规范键 / Use canonical |
| `ui.text_2700` | 🔄 改用规范键 / Use canonical |

### "确认修改" (7 keys)

**推荐规范键 / Canonical**: `modal.change_password.btn_confirm`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `modal.change_password.btn_confirm` | ✅ 保留 / Keep |
| `ui.icon_3027` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3170` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3222` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3258` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3281` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3356` | 🔄 改用规范键 / Use canonical |

### "状态" (7 keys)

**推荐规范键 / Canonical**: `common.status`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.status` | ✅ 保留 / Keep |
| `log.table.status` | 🔄 改用规范键 / Use canonical |
| `ui.text_2031` | 🔄 改用规范键 / Use canonical |
| `ui.text_2036` | 🔄 改用规范键 / Use canonical |
| `ui.text_2156` | 🔄 改用规范键 / Use canonical |
| `ui.text_2229` | 🔄 改用规范键 / Use canonical |
| `ui.text_2326` | 🔄 改用规范键 / Use canonical |

### "排序方式" (7 keys)

**推荐规范键 / Canonical**: `purchase.sort_by`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.sort_by` | ✅ 保留 / Keep |
| `ui.icon_3161` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3174` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3185` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3359` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3362` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3367` | 🔄 改用规范键 / Use canonical |

### "入库日期" (7 keys)

**推荐规范键 / Canonical**: `purchase.receive_date`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.receive_date` | ✅ 保留 / Keep |
| `table.receive_date` | 🔄 改用规范键 / Use canonical |
| `ui.text_2100` | 🔄 改用规范键 / Use canonical |
| `ui.text_2143` | 🔄 改用规范键 / Use canonical |
| `ui.text_2181` | 🔄 改用规范键 / Use canonical |
| `ui.text_2313` | 🔄 改用规范键 / Use canonical |
| `ui.text_2328` | 🔄 改用规范键 / Use canonical |

### "付款单号" (7 keys)

**推荐规范键 / Canonical**: `table.pmt_no`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `table.pmt_no` | ✅ 保留 / Keep |
| `ui.text_1188` | 🔄 改用规范键 / Use canonical |
| `ui.text_2460` | 🔄 改用规范键 / Use canonical |
| `ui.text_1203` | 🔄 改用规范键 / Use canonical |
| `ui.text_2480` | 🔄 改用规范键 / Use canonical |
| `ui.text_1514` | 🔄 改用规范键 / Use canonical |
| `ui.text_1597` | 🔄 改用规范键 / Use canonical |

### "汇率" (7 keys)

**推荐规范键 / Canonical**: `table.exchange_rate`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `table.exchange_rate` | ✅ 保留 / Keep |
| `ui.text_2197` | 🔄 改用规范键 / Use canonical |
| `ui.text_2254` | 🔄 改用规范键 / Use canonical |
| `ui.text_2400` | 🔄 改用规范键 / Use canonical |
| `ui.text_2464` | 🔄 改用规范键 / Use canonical |
| `ui.text_1536` | 🔄 改用规范键 / Use canonical |
| `ui.text_2668` | 🔄 改用规范键 / Use canonical |

### "手动输入" (7 keys)

**推荐规范键 / Canonical**: `js.mode_manual`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `js.mode_manual` | ✅ 保留 / Keep |
| `js.rate_manual_input` | 🔄 改用规范键 / Use canonical |
| `ui.text_864` | 🔄 改用规范键 / Use canonical |
| `ui.text_870` | 🔄 改用规范键 / Use canonical |
| `ui.text_964` | 🔄 改用规范键 / Use canonical |
| `ui.text_970` | 🔄 改用规范键 / Use canonical |
| `ui.text_1095` | 🔄 改用规范键 / Use canonical |

### "合计:" (7 keys)

**推荐规范键 / Canonical**: `js.total_label`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `js.total_label` | ✅ 保留 / Keep |
| `ui.text_2231` | 🔄 改用规范键 / Use canonical |
| `ui.text_2337` | 🔄 改用规范键 / Use canonical |
| `ui.text_2340` | 🔄 改用规范键 / Use canonical |
| `ui.text_2344` | 🔄 改用规范键 / Use canonical |
| `ui.text_2352` | 🔄 改用规范键 / Use canonical |
| `ui.text_2617` | 🔄 改用规范键 / Use canonical |

### "结算货币" (7 keys)

**推荐规范键 / Canonical**: `js.settlement_currency`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `js.settlement_currency` | ✅ 保留 / Keep |
| `ui.text_2232` | 🔄 改用规范键 / Use canonical |
| `ui.text_2245` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3419` | 🔄 改用规范键 / Use canonical |
| `ui.text_1491` | 🔄 改用规范键 / Use canonical |
| `ui.text_1577` | 🔄 改用规范键 / Use canonical |
| `desc.d135` | 🔄 改用规范键 / Use canonical |

### "入库" (7 keys)

**推荐规范键 / Canonical**: `ui.text_2005`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_2005` | ✅ 保留 / Keep |
| `ui.text_2155` | 🔄 改用规范键 / Use canonical |
| `ui.text_2264` | 🔄 改用规范键 / Use canonical |
| `ui.text_2266` | 🔄 改用规范键 / Use canonical |
| `ui.text_2268` | 🔄 改用规范键 / Use canonical |
| `ui.text_2299` | 🔄 改用规范键 / Use canonical |
| `ui.text_2325` | 🔄 改用规范键 / Use canonical |

### "未启用" (7 keys)

**推荐规范键 / Canonical**: `ui.text_390`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_390` | ✅ 保留 / Keep |
| `ui.text_445` | 🔄 改用规范键 / Use canonical |
| `ui.text_446` | 🔄 改用规范键 / Use canonical |
| `ui.text_448` | 🔄 改用规范键 / Use canonical |
| `ui.text_449` | 🔄 改用规范键 / Use canonical |
| `ui.text_648` | 🔄 改用规范键 / Use canonical |
| `ui.text_649` | 🔄 改用规范键 / Use canonical |

### "历史修订记录" (7 keys)

**推荐规范键 / Canonical**: `ui.text_417`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_417` | ✅ 保留 / Keep |
| `ui.text_705` | 🔄 改用规范键 / Use canonical |
| `ui.text_1062` | 🔄 改用规范键 / Use canonical |
| `ui.text_1461` | 🔄 改用规范键 / Use canonical |
| `ui.text_1527` | 🔄 改用规范键 / Use canonical |
| `ui.text_1550` | 🔄 改用规范键 / Use canonical |
| `ui.text_1628` | 🔄 改用规范键 / Use canonical |

### "修订" (7 keys)

**推荐规范键 / Canonical**: `ui.text_714`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_714` | ✅ 保留 / Keep |
| `ui.text_721` | 🔄 改用规范键 / Use canonical |
| `ui.text_803` | 🔄 改用规范键 / Use canonical |
| `ui.text_1071` | 🔄 改用规范键 / Use canonical |
| `ui.text_1074` | 🔄 改用规范键 / Use canonical |
| `ui.text_1396` | 🔄 改用规范键 / Use canonical |
| `ui.text_1399` | 🔄 改用规范键 / Use canonical |

### "原信息" (7 keys)

**推荐规范键 / Canonical**: `ui.text_2407`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_2407` | ✅ 保留 / Keep |
| `ui.text_2409` | 🔄 改用规范键 / Use canonical |
| `ui.text_2411` | 🔄 改用规范键 / Use canonical |
| `ui.text_2413` | 🔄 改用规范键 / Use canonical |
| `ui.text_2415` | 🔄 改用规范键 / Use canonical |
| `ui.text_2416` | 🔄 改用规范键 / Use canonical |
| `ui.text_2418` | 🔄 改用规范键 / Use canonical |

### "预付抵扣" (7 keys)

**推荐规范键 / Canonical**: `ui.text_2484`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_2484` | ✅ 保留 / Keep |
| `ui.text_2527` | 🔄 改用规范键 / Use canonical |
| `ui.text_1331` | 🔄 改用规范键 / Use canonical |
| `ui.text_1350` | 🔄 改用规范键 / Use canonical |
| `ui.text_2575` | 🔄 改用规范键 / Use canonical |
| `ui.text_1544` | 🔄 改用规范键 / Use canonical |
| `ui.text_2716` | 🔄 改用规范键 / Use canonical |

### "无实质变更" (7 keys)

**推荐规范键 / Canonical**: `ui.text_2629`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_2629` | ✅ 保留 / Keep |
| `ui.text_2636` | 🔄 改用规范键 / Use canonical |
| `ui.text_2642` | 🔄 改用规范键 / Use canonical |
| `ui.text_2671` | 🔄 改用规范键 / Use canonical |
| `ui.text_2677` | 🔄 改用规范键 / Use canonical |
| `ui.text_2725` | 🔄 改用规范键 / Use canonical |
| `ui.text_2731` | 🔄 改用规范键 / Use canonical |

### "操作失败" (6 keys)

**推荐规范键 / Canonical**: `modal.error.title`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `modal.error.title` | ✅ 保留 / Keep |
| `toast.operation_failed` | 🔄 改用规范键 / Use canonical |
| `api.error` | 🔄 改用规范键 / Use canonical |
| `ui.text_217` | 🔄 改用规范键 / Use canonical |
| `ui.text_516` | 🔄 改用规范键 / Use canonical |
| `ui.text_1742` | 🔄 改用规范键 / Use canonical |

### "确认删除" (6 keys)

**推荐规范键 / Canonical**: `modal.confirm_delete.title`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `modal.confirm_delete.title` | ✅ 保留 / Keep |
| `user_admin.confirm_delete` | 🔄 改用规范键 / Use canonical |
| `file.confirm_delete` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3202` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3252` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3333` | 🔄 改用规范键 / Use canonical |

### "失败" (6 keys)

**推荐规范键 / Canonical**: `toast.failed`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `toast.failed` | ✅ 保留 / Keep |
| `js.failed` | 🔄 改用规范键 / Use canonical |
| `ui.text_1148` | 🔄 改用规范键 / Use canonical |
| `ui.text_1152` | 🔄 改用规范键 / Use canonical |
| `ui.text_1165` | 🔄 改用规范键 / Use canonical |
| `option.o7211` | 🔄 改用规范键 / Use canonical |

### "关闭" (6 keys)

**推荐规范键 / Canonical**: `common.close`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.close` | ✅ 保留 / Keep |
| `ui.text_251` | 🔄 改用规范键 / Use canonical |
| `ui.text_716` | 🔄 改用规范键 / Use canonical |
| `ui.text_718` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3386` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3483` | 🔄 改用规范键 / Use canonical |

### "全选" (6 keys)

**推荐规范键 / Canonical**: `common.select_all`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.select_all` | ✅ 保留 / Keep |
| `perms.select_all` | 🔄 改用规范键 / Use canonical |
| `ui.text_86` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3187` | 🔄 改用规范键 / Use canonical |
| `ui.text_1192` | 🔄 改用规范键 / Use canonical |
| `ui.text_1208` | 🔄 改用规范键 / Use canonical |

### "修改备注" (6 keys)

**推荐规范键 / Canonical**: `common.modify_note`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.modify_note` | ✅ 保留 / Keep |
| `ui.text_698` | 🔄 改用规范键 / Use canonical |
| `ui.text_700` | 🔄 改用规范键 / Use canonical |
| `ui.text_2251` | 🔄 改用规范键 / Use canonical |
| `ui.text_1126` | 🔄 改用规范键 / Use canonical |
| `desc.d134` | 🔄 改用规范键 / Use canonical |

### "返回采购板块" (6 keys)

**推荐规范键 / Canonical**: `purchase.back_to_hub`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `purchase.back_to_hub` | ✅ 保留 / Keep |
| `ui.icon_3198` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3254` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3267` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3306` | 🔄 改用规范键 / Use canonical |
| `tooltip.t1489` | 🔄 改用规范键 / Use canonical |

### "批量付款" (6 keys)

**推荐规范键 / Canonical**: `finance.batch_payment`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `finance.batch_payment` | ✅ 保留 / Keep |
| `ui.text_1187` | 🔄 改用规范键 / Use canonical |
| `ui.text_1202` | 🔄 改用规范键 / Use canonical |
| `ui.text_1247` | 🔄 改用规范键 / Use canonical |
| `ui.text_1402` | 🔄 改用规范键 / Use canonical |
| `ui.text_1574` | 🔄 改用规范键 / Use canonical |

### "定金费用" (6 keys)

**推荐规范键 / Canonical**: `table.deposit_amount`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `table.deposit_amount` | ✅ 保留 / Keep |
| `ui.text_2456` | 🔄 改用规范键 / Use canonical |
| `ui.text_2546` | 🔄 改用规范键 / Use canonical |
| `ui.text_2606` | 🔄 改用规范键 / Use canonical |
| `ui.text_2654` | 🔄 改用规范键 / Use canonical |
| `ui.text_2738` | 🔄 改用规范键 / Use canonical |

### "订单数量" (6 keys)

**推荐规范键 / Canonical**: `table.ordered_qty`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `table.ordered_qty` | ✅ 保留 / Keep |
| `ui.text_2095` | 🔄 改用规范键 / Use canonical |
| `ui.text_2103` | 🔄 改用规范键 / Use canonical |
| `ui.text_2107` | 🔄 改用规范键 / Use canonical |
| `ui.text_2112` | 🔄 改用规范键 / Use canonical |
| `ui.text_2119` | 🔄 改用规范键 / Use canonical |

### "差异" (6 keys)

**推荐规范键 / Canonical**: `table.variance`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `table.variance` | ✅ 保留 / Keep |
| `ui.text_2081` | 🔄 改用规范键 / Use canonical |
| `ui.text_2098` | 🔄 改用规范键 / Use canonical |
| `ui.text_2115` | 🔄 改用规范键 / Use canonical |
| `ui.text_2300` | 🔄 改用规范键 / Use canonical |
| `ui.text_2333` | 🔄 改用规范键 / Use canonical |

### "预计到货日期" (6 keys)

**推荐规范键 / Canonical**: `abnormal.expected_arrival`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `abnormal.expected_arrival` | ✅ 保留 / Keep |
| `ui.text_2141` | 🔄 改用规范键 / Use canonical |
| `ui.text_2311` | 🔄 改用规范键 / Use canonical |
| `ui.text_2359` | 🔄 改用规范键 / Use canonical |
| `ui.text_2374` | 🔄 改用规范键 / Use canonical |
| `ui.text_2408` | 🔄 改用规范键 / Use canonical |

### "操作流程" (6 keys)

**推荐规范键 / Canonical**: `shipping.workflow_title`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `shipping.workflow_title` | ✅ 保留 / Keep |
| `ui.icon_3195` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3286` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3295` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3310` | 🔄 改用规范键 / Use canonical |
| `ui.text_1438` | 🔄 改用规范键 / Use canonical |

### "参数校验未通过" (6 keys)

**推荐规范键 / Canonical**: `shipping.verify_failed`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `shipping.verify_failed` | ✅ 保留 / Keep |
| `ui.text_664` | 🔄 改用规范键 / Use canonical |
| `ui.text_861` | 🔄 改用规范键 / Use canonical |
| `ui.text_932` | 🔄 改用规范键 / Use canonical |
| `ui.text_1011` | 🔄 改用规范键 / Use canonical |
| `ui.text_1094` | 🔄 改用规范键 / Use canonical |

### "预计到达" (6 keys)

**推荐规范键 / Canonical**: `js.eta_date`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `js.eta_date` | ✅ 保留 / Keep |
| `ui.text_2165` | 🔄 改用规范键 / Use canonical |
| `ui.text_2175` | 🔄 改用规范键 / Use canonical |
| `ui.text_2185` | 🔄 改用规范键 / Use canonical |
| `ui.text_2395` | 🔄 改用规范键 / Use canonical |
| `ui.text_2501` | 🔄 改用规范键 / Use canonical |

### "发货" (6 keys)

**推荐规范键 / Canonical**: `ui.text_2154`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_2154` | ✅ 保留 / Keep |
| `ui.text_2263` | 🔄 改用规范键 / Use canonical |
| `ui.text_2265` | 🔄 改用规范键 / Use canonical |
| `ui.text_2267` | 🔄 改用规范键 / Use canonical |
| `ui.text_2298` | 🔄 改用规范键 / Use canonical |
| `ui.text_2324` | 🔄 改用规范键 / Use canonical |

### "*必填" (6 keys)

**推荐规范键 / Canonical**: `ui.text_660`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_660` | ✅ 保留 / Keep |
| `ui.text_663` | 🔄 改用规范键 / Use canonical |
| `ui.text_786` | 🔄 改用规范键 / Use canonical |
| `ui.text_1086` | 🔄 改用规范键 / Use canonical |
| `ui.text_1093` | 🔄 改用规范键 / Use canonical |
| `ui.text_1109` | 🔄 改用规范键 / Use canonical |

### "${data.message || (window.i18n?.t('js.load_failed') || 'Load Failed')}" (6 keys)

**推荐规范键 / Canonical**: `ui.text_710`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_710` | ✅ 保留 / Keep |
| `ui.text_799` | 🔄 改用规范键 / Use canonical |
| `ui.text_1067` | 🔄 改用规范键 / Use canonical |
| `ui.text_1323` | 🔄 改用规范键 / Use canonical |
| `ui.text_1370` | 🔄 改用规范键 / Use canonical |
| `ui.text_1611` | 🔄 改用规范键 / Use canonical |

### "(不变)" (6 keys)

**推荐规范键 / Canonical**: `ui.text_735`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_735` | ✅ 保留 / Keep |
| `ui.text_736` | 🔄 改用规范键 / Use canonical |
| `ui.text_737` | 🔄 改用规范键 / Use canonical |
| `ui.text_738` | 🔄 改用规范键 / Use canonical |
| `ui.text_739` | 🔄 改用规范键 / Use canonical |
| `ui.text_740` | 🔄 改用规范键 / Use canonical |

### "付款单号: ${pmtNo}" (6 keys)

**推荐规范键 / Canonical**: `ui.text_1296`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `ui.text_1296` | ✅ 保留 / Keep |
| `ui.text_1300` | 🔄 改用规范键 / Use canonical |
| `ui.text_1622` | 🔄 改用规范键 / Use canonical |
| `ui.text_1626` | 🔄 改用规范键 / Use canonical |
| `ui.text_1652` | 🔄 改用规范键 / Use canonical |
| `ui.text_1656` | 🔄 改用规范键 / Use canonical |

### "成功" (5 keys)

**推荐规范键 / Canonical**: `toast.success`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `toast.success` | ✅ 保留 / Keep |
| `ui.text_1147` | 🔄 改用规范键 / Use canonical |
| `ui.text_1151` | 🔄 改用规范键 / Use canonical |
| `ui.text_1163` | 🔄 改用规范键 / Use canonical |
| `option.o4912` | 🔄 改用规范键 / Use canonical |

### "加载中..." (5 keys)

**推荐规范键 / Canonical**: `common.loading`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `toast.loading` | 🔄 改用规范键 / Use canonical |
| `common.loading` | ✅ 保留 / Keep |
| `ui.text_358` | 🔄 改用规范键 / Use canonical |
| `ui.text_599` | 🔄 改用规范键 / Use canonical |
| `option.o4026` | 🔄 改用规范键 / Use canonical |

### "上传成功" (5 keys)

**推荐规范键 / Canonical**: `toast.upload_success`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `toast.upload_success` | ✅ 保留 / Keep |
| `file.upload_success` | 🔄 改用规范键 / Use canonical |
| `ui.text_485` | 🔄 改用规范键 / Use canonical |
| `ui.text_545` | 🔄 改用规范键 / Use canonical |
| `ui.text_582` | 🔄 改用规范键 / Use canonical |

### "确认" (5 keys)

**推荐规范键 / Canonical**: `common.confirm`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.confirm` | ✅ 保留 / Keep |
| `js.confirm` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3188` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3143` | 🔄 改用规范键 / Use canonical |
| `ui.icon_3232` | 🔄 改用规范键 / Use canonical |

### "上一页" (5 keys)

**推荐规范键 / Canonical**: `common.prev_page`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.prev_page` | ✅ 保留 / Keep |
| `ui.text_1139` | 🔄 改用规范键 / Use canonical |
| `ui.text_1153` | 🔄 改用规范键 / Use canonical |
| `ui.text_1166` | 🔄 改用规范键 / Use canonical |
| `ui.text_1172` | 🔄 改用规范键 / Use canonical |

### "下一页" (5 keys)

**推荐规范键 / Canonical**: `common.next_page`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.next_page` | ✅ 保留 / Keep |
| `ui.text_1140` | 🔄 改用规范键 / Use canonical |
| `ui.text_1154` | 🔄 改用规范键 / Use canonical |
| `ui.text_1167` | 🔄 改用规范键 / Use canonical |
| `ui.text_1173` | 🔄 改用规范键 / Use canonical |

### "必填" (5 keys)

**推荐规范键 / Canonical**: `common.required`

| 键 / Key | 操作 / Action |
|----------|---------------|
| `common.required` | ✅ 保留 / Keep |
| `ui.text_699` | 🔄 改用规范键 / Use canonical |
| `ui.text_745` | 🔄 改用规范键 / Use canonical |
| `ui.text_841` | 🔄 改用规范键 / Use canonical |
| `ui.text_1047` | 🔄 改用规范键 / Use canonical |


---

## 清理建议 / Cleanup Recommendations

1. **保留规范键**: 在 `common.*`, `modal.*`, `toast.*` 等通用命名空间中保留一个规范键
2. **更新模板**: 将使用冗余键的模板改为使用规范键
3. **删除冗余键**: 清理后删除不再使用的冗余键

### 优先清理的命名空间 / Priority Cleanup Namespaces

- `ui.text_*` - 大量自动生成的键，应改用规范键
- `ui.icon_*` - 按钮文本键，应统一到 `common.*`
- 重复的语义键 (如 `js.cancel` vs `common.cancel`)

---

*报告由自动化脚本生成 / Report generated by automation script*
