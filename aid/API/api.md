# eBay API Ecosystem: Comprehensive Reference
> **Generated Date:** 2026-01-16
> **Source:** `aid/API/sell_account_v1_oas3.json` (Account V1) & eBay Developer Portal (Others)
> **Scope:** Full, detailed method-level reference for all Selling & key Buying APIs.

## General Architecture (Based on OAS3 Standard)
All eBay REST APIs follow a consistent architectural style:
*   **Base URL**: `https://api.ebay.com{basePath}`
*   **Authentication**: OAuth 2.0 with scopes (e.g., `sell.account`, `sell.inventory`).
*   **Error Handling**: Standardized error codes (e.g., `204xx` for Request Errors, `205xx` for System Errors).

---

## Part 1: Selling APIs
The Selling APIs enable sellers and developers to manage business operations programmatically.

### 1. Account Management
**API Name**: `Account API v1`
**Source**: OAS3 JSON Spec
**Description**: Manage business policies (payment, shipping, return), tax tables, privileges, and program participation.

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `getCustomPolicies` | GET | `/custom_policy/` | Retrieve list of custom policies (e.g. compliance). |
| `createCustomPolicy` | POST | `/custom_policy/` | Create a new custom policy. |
| `getCustomPolicy` | GET | `/custom_policy/{custom_policy_id}` | Retrieve a specific custom policy. |
| `updateCustomPolicy` | PUT | `/custom_policy/{custom_policy_id}` | Update a custom policy. |
| `createFulfillmentPolicy` | POST | `/fulfillment_policy/` | Create a new shipping policy. |
| `getFulfillmentPolicy` | GET | `/fulfillment_policy/{fulfillmentPolicyId}` | Retrieve a specific shipping policy. |
| `updateFulfillmentPolicy` | PUT | `/fulfillment_policy/{fulfillmentPolicyId}` | Update a shipping policy. |
| `deleteFulfillmentPolicy` | DELETE | `/fulfillment_policy/{fulfillmentPolicyId}` | Delete a shipping policy. |
| `getFulfillmentPolicies` | GET | `/fulfillment_policy` | Retrieve all shipping policies. |
| `getFulfillmentPolicyByName`| GET | `/fulfillment_policy/get_by_policy_name` | Find shipping policy by name. |
| `getPaymentPolicies` | GET | `/payment_policy` | Retrieve all payment policies. |
| `createPaymentPolicy` | POST | `/payment_policy` | Create a new payment policy. |
| `getPaymentPolicy` | GET | `/payment_policy/{payment_policy_id}` | Retrieve a specific payment policy. |
| `updatePaymentPolicy` | PUT | `/payment_policy/{payment_policy_id}` | Update a payment policy. |
| `deletePaymentPolicy` | DELETE | `/payment_policy/{payment_policy_id}` | Delete a payment policy. |
| `getPaymentPolicyByName` | GET | `/payment_policy/get_by_policy_name` | Find payment policy by name. |
| `getPaymentsProgram` | GET | `/payments_program/{marketplace_id}/{payments_program_type}` | Check status in payments program. |
| `getPaymentsProgramOnboarding`| GET | `/payments_program/{marketplace_id}/{payments_program_type}/onboarding` | Check onboarding steps required. |
| `getPrivileges` | GET | `/privilege` | Check selling limits and account status. |
| `getOptedInPrograms` | GET | `/program/get_opted_in_programs` | List subscribed seller programs. |
| `optInToProgram` | POST | `/program/opt_in` | Opt in to a program (e.g. Out of Stock Control). |
| `optOutOfProgram` | POST | `/program/opt_out` | Opt out of a program. |
| `getRateTables` | GET | `/rate_table` | Retrieve shipping rate tables. |
| `getReturnPolicies` | GET | `/return_policy` | Retrieve all return policies. |
| `createReturnPolicy` | POST | `/return_policy` | Create a new return policy. |
| `getReturnPolicy` | GET | `/return_policy/{return_policy_id}` | Retrieve a specific return policy. |
| `updateReturnPolicy` | PUT | `/return_policy/{return_policy_id}` | Update a return policy. |
| `deleteReturnPolicy` | DELETE | `/return_policy/{return_policy_id}` | Delete a return policy. |
| `getReturnPolicyByName` | GET | `/return_policy/get_by_policy_name` | Find return policy by name. |
| `getSalesTaxJurisdictions` | GET | `/sales_tax` | Retrieve tax table entries. |
| `createOrReplaceSalesTax` | PUT | `/sales_tax/{countryCode}/{jurisdictionId}` | Set tax rate for a jurisdiction. |
| `deleteSalesTax` | DELETE | `/sales_tax/{countryCode}/{jurisdictionId}` | Delete tax rate for a jurisdiction. |
| `getSalesTax` | GET | `/sales_tax/{countryCode}/{jurisdictionId}` | Get tax rate for a jurisdiction. |
| `getSubscription` | GET | `/subscription` | Check Store Subscription status. |
| `getKYC` | GET | `/kyc` | Check Know Your Customer status. |
| `getAdvertisingEligibility` | GET | `/advertising_eligibility` | Check eligibility for Promoted Listings. |

**API Name**: `Account API v2`
**Description**: Advanced tools for custom shipping rate tables and split payouts.

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `getRateTable` | GET | `/rate_table/{rate_table_id}` | Retrieve a specific shipping rate table. |
| `getPayoutSettings` | GET | `/payout_settings` | Retrieve split payout settings (CN only). |
| `updatePayoutPercentage` | PUT | `/payout_settings` | Update split payout percentages (CN only). |

---

### 2. Analytics & Reporting
**API Name**: `Analytics API`
**Description**: Insights into traffic, seller standards, and customer service metrics.

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `getTrafficReport` | GET | `/traffic_report` | Get detailed traffic data (views, impressions). |
| `getSellerStandardsProfiles` | GET | `/seller_standards_profile` | Get all seller standards profiles. |
| `getSellerStandardsProfile` | GET | `/seller_standards_profile/{program}/{cycle}` | Get specific profile (e.g. US, CURRENT). |
| `getCustomerServiceMetric` | GET | `/customer_service_metric` | Get "Item Not as Described" metrics. |

---

### 3. Listing Management
**API Name**: `Inventory API`
**Description**: Modern, retail-centric inventory and offer management.

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `getInventoryItem` | GET | `/inventory_item/{sku}` | Retrieve details of an inventory item. |
| `createOrReplaceInventoryItem` | PUT | `/inventory_item/{sku}` | Create or update an inventory item record. |
| `deleteInventoryItem` | DELETE | `/inventory_item/{sku}` | Delete an inventory item. |
| `bulkGetInventoryItem` | POST | `/bulk_get_inventory_item` | Get up to 25 items at once. |
| `bulkUpdatePriceQuantity` | POST | `/bulk_update_price_quantity` | Update price/qty for up to 25 items. |
| `createOffer` | POST | `/offer` | Create a new offer for an item. |
| `getOffer` | GET | `/offer/{offerId}` | Retrieve details of an offer. |
| `publishOffer` | POST | `/offer/{offerId}/publish` | Publish an offer to make it a live listing. |
| `withdrawOffer` | POST | `/offer/{offerId}/withdraw` | End a listing. |
| `getInventoryLocations` | GET | `/location` | Get all defined inventory locations. |
| `createInventoryLocation` | POST | `/location/{merchantLocationKey}` | Create a new warehouse location. |

---

### 4. Order Management
**API Name**: `Fulfillment API`
**Description**: Retrieve orders, manage shipping fulfillment, and handle disputes.

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `getOrders` | GET | `/order` | Retrieve orders with filters (date, status). |
| `getOrder` | GET | `/order/{orderId}` | Get details of a single order. |
| `createShippingFulfillment` | POST | `/order/{orderId}/shipping_fulfillment` | Upload tracking number/mark shipped. |
| `getShippingFulfillments` | GET | `/order/{orderId}/shipping_fulfillment` | Get tracking details for an order. |
| `issueRefund` | POST | `/order/{orderId}/issue_refund` | Issue a refund to the buyer. |
| `getPaymentDisputes` | GET | `/payment_dispute` | Retrieve list of payment disputes. |
| `getPaymentDispute` | GET | `/payment_dispute/{payment_dispute_id}` | Get details of a specific dispute. |
| `contestPaymentDispute` | POST | `/payment_dispute/{payment_dispute_id}/contest` | Contest a dispute. |
| `uploadEvidenceFile` | POST | `/payment_dispute/{payment_dispute_id}/upload_evidence_file` | Upload photo/doc evidence. |
---

### 4.5. Logistics (物流/运单)
**API Name**: `Logistics API`
**Base URL**: `https://api.ebay.com/sell/logistics/v1`
**Description**: 获取运费报价并创建运单。**注意：此 API 仅对特定开发者开放 (Limited Release)**。

#### shipping_quote (运费报价)

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `createShippingQuote` | POST | `/shipping_quote` | 创建运费报价请求，获取多个快递商的实时报价 |
| `getShippingQuote` | GET | `/shipping_quote/{shippingQuoteId}` | 获取已创建的运费报价详情 |

#### shipment (运单)

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `createFromShippingQuote` | POST | `/shipment/create_from_shipping_quote` | 根据选定的报价创建运单 |
| `getShipment` | GET | `/shipment/{shipmentId}` | 获取运单详情 |
| `downloadLabelFile` | GET | `/shipment/{shipmentId}/download_label_file` | 下载运单标签文件 |
| `cancelShipment` | POST | `/shipment/{shipmentId}/cancel` | 取消运单 |

---

### 5. Finances
**API Name**: `Finances API`
**Base URL**: `https://apiz.ebay.com` (注意：使用 `apiz` 子域名，不是 `api`)
**Description**: Track payouts, transactions, and available funds.

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `getTransactions` | GET | `/sell/finances/v1/transaction` | Get all monetary transactions (Sales, Fees). |
| `getTransactionSummary` | GET | `/sell/finances/v1/transaction_summary` | Get aggregated transaction totals. |
| `getPayouts` | GET | `/sell/finances/v1/payout` | Get history of bank payouts. |
| `getPayout` | GET | `/sell/finances/v1/payout/{payoutId}` | Get details of a specific payout. |
| `getPayoutSummary` | GET | `/sell/finances/v1/payout_summary` | Get summary of payouts (pending/paid). |
| `getSellerFundsSummary` | GET | `/sell/finances/v1/seller_funds_summary` | Get available, processing, and held funds. |
| `getTransfer` | GET | `/sell/finances/v1/transfer/{transferId}` | Get details of a transfer (charge to seller). |

#### `getTransactions` 响应字段 (基于实际测试)

**响应外层：**
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `href` | string | 当前请求的完整 URL |
| `next` | string | 下一页 URL (分页用) |
| `limit` | int | 每页记录数 |
| `offset` | int | 当前偏移量 |
| `total` | int | 总记录数 |
| `transactions` | array | 交易记录数组 |

**单条交易记录 (SALE 类型)：**
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `transactionId` | string | 交易 ID (如 `01-14123-70739`) |
| `orderId` | string | 订单 ID |
| `salesRecordReference` | string | 销售记录参考号 |
| `buyer.username` | string | 买家用户名 |
| `transactionType` | string | 交易类型 (`SALE`, `REFUND`, `NON_SALE_CHARGE` 等) |
| `amount.value` | string | 金额 (如 `16.24`) |
| `amount.currency` | string | 货币 (如 `USD`) |
| `totalFeeBasisAmount.value` | string | 费用计算基础金额 |
| `totalFeeAmount.value` | string | 总费用金额 |
| `orderLineItems[]` | array | 订单行项目数组 |
| `orderLineItems[].lineItemId` | string | 行项目 ID |
| `orderLineItems[].feeBasisAmount.value` | string | 行项目费用基础金额 |
| `orderLineItems[].marketplaceFees[]` | array | 平台费用明细 |
| `orderLineItems[].marketplaceFees[].feeType` | string | 费用类型 (`FINAL_VALUE_FEE`, `HIGH_ITEM_NOT_AS_DESCRIBED_FEE`, `FINAL_VALUE_FEE_FIXED_PER_ORDER`) |
| `orderLineItems[].marketplaceFees[].amount.value` | string | 费用金额 |
| `bookingEntry` | string | 记账方向 (`CREDIT` 入账 / `DEBIT` 扣款) |
| `transactionDate` | string | 交易时间 (ISO 8601) |
| `transactionStatus` | string | 状态 (`FUNDS_PROCESSING`, `FUNDS_AVAILABLE_FOR_PAYOUT`, `PAYOUT`) |
| `paymentsEntity` | string | 支付实体 (如 `eBay Commerce Inc.`) |
| `ebayCollectedTaxAmount.value` | string | eBay 代收税金 |

**单条交易记录 (NON_SALE_CHARGE 类型)：**
| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `transactionId` | string | 交易 ID (如 `FEE-7208237262413_11`) |
| `salesRecordReference` | string | 销售记录参考号 |
| `transactionType` | string | `NON_SALE_CHARGE` |
| `amount.value` | string | 费用金额 |
| `bookingEntry` | string | `DEBIT` (扣款) |
| `transactionDate` | string | 交易时间 |
| `transactionStatus` | string | 状态 |
| `transactionMemo` | string | 备注 (如 `Promoted Listings - General fee`) |
| `paymentsEntity` | string | 支付实体 |
| `references[]` | array | 关联引用 |
| `references[].referenceId` | string | 关联 ID (Item ID 或 Order ID) |
| `references[].referenceType` | string | 引用类型 (`ITEM_ID`, `ORDER_ID`) |
| `feeType` | string | 费用类型 (如 `AD_FEE`) |

#### `getTransactionSummary` 响应字段 (基于实际测试)

**必填过滤参数**: `transactionStatus:{PAYOUT}` (或其他状态)

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `creditCount` | int | 销售入账笔数 |
| `creditAmount.value` | string | 销售入账总金额 |
| `creditAmount.currency` | string | 货币 |
| `creditBookingEntry` | string | `CREDIT` |
| `refundCount` | int | 退款笔数 |
| `refundAmount.value` | string | 退款总金额 |
| `refundBookingEntry` | string | `DEBIT` |
| `disputeCount` | int | 争议笔数 |
| `disputeAmount.value` | string | 争议总金额 |
| `disputeBookingEntry` | string | `DEBIT` |
| `shippingLabelCount` | int | 运费标签购买笔数 |
| `shippingLabelAmount.value` | string | 运费标签总支出 |
| `shippingLabelBookingEntry` | string | `DEBIT` |
| `nonSaleChargeCount` | int | 非销售扣费笔数 (如推广费) |
| `nonSaleChargeAmount.value` | string | 非销售扣费总额 |
| `nonSaleChargeBookingEntry` | string | `DEBIT` |
| `transferCount` | int | 转账笔数 |
| `adjustmentCount` | int | 调整笔数 |
| `withdrawalCount` | int | 提现笔数 |
| `loanRepaymentCount` | int | 贷款还款笔数 |
| `purchaseCount` | int | 购买笔数 |

---

### 6. Marketing & Promotions
**API Name**: `Marketing API`
**Description**: Manage Promoted Listings and Item Promotions.

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `getCampaigns` | GET | `/ad_campaign` | Retrieve all ad campaigns. |
| `createCampaign` | POST | `/ad_campaign` | Create a new campaign. |
| `getReport` | GET | `/ad_report/{reportId}` | Download a campaign performance report. |
| `createItemPriceMarkdownPromotion` | POST | `/item_price_markdown` | Create a "Sale Event" (Markdown). |
| `createItemPromotion` | POST | `/item_promotion` | Create a "Threshold" promo (BOGO). |
| `createReportTask` | POST | `/ad_report_task` | Schedule a report generation task. |

---

### 7. Listing Metadata
**API Name**: `Metadata API`
**Description**: Retrieve static reference data required for listing items.

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `getItemConditionPolicies` | GET | `/marketplace/{marketplace_id}/get_item_condition_policies` | Get valid condition IDs (New/Used). |
| `getReturnPolicies` | GET | `/marketplace/{marketplace_id}/get_return_policies` | Get valid return periods. |
| `getShippingCarriers` | GET | `/marketplace/{marketplace_id}/get_shipping_carriers` | Get list of supported carriers. |
| `getSalesTaxJurisdictions` | GET | `/country/{countryCode}/get_sales_tax_jurisdictions` | Get tax jurisdictions. |
| `getAutomotivePartsCompatibilityPolicies`| GET | `/marketplace/{marketplace_id}/get_automotive_parts_compatibility_policies` | Get parts compatibility rules. |

---

### 8. Compliance
**API Name**: `Compliance API`
**Description**: Check listings for policy violations.

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `getListingViolations` | GET | `/listing_violation` | Get listings with specific violations. |
| `getListingViolationsSummary` | GET | `/listing_violation_summary` | Get counts/types of violations. |

---

### 9. Other APIs (Feeds)
**API Name**: `Feed API`
**Description**: High-volume, asynchronous bulk operations.

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `createOrderTask` | POST | `/order_task` | Create task to download Order Report. |
| `createInventoryTask` | POST | `/inventory_task` | Create task to upload Inventory. |
| `getTask` | GET | `/task/{taskId}` | Check status of a feed task. |
| `getResultFile` | GET | `/task/{taskId}/download_result_file` | Download the processed file. |
| `createSchedule` | POST | `/schedule` | Schedule recurring feed tasks. |

---

## Part 2: Buying APIs

### 1. Buying - Browse
**API Name**: `Browse API`
**Description**: Search for items and retrieve item details.

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `search` | GET | `/item_summary/search` | Search for items by keyword/category. |
| `getItem` | GET | `/item/{item_id}` | Get full details of a specific item. |
| `getItemsByItemGroup` | GET | `/item_group/{item_group_id}` | Get items in a multi-variation group. |

### 2. Buying - Order
**API Name**: `Order API`
**Description**: Purchase items as a guest or member.

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `createGuestCheckoutSession` | POST | `/guest_checkout_session` | Initiate a guest checkout. |
| `getGuestPurchaseOrder` | GET | `/guest_checkout_session/{checkoutSessionId}` | View guest order details. |

### 3. Buying - Offer
**API Name**: `Offer API`
**Description**: Place bids and offers.

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `placeProxyBid` | POST | `/bidding/{item_id}/place_proxy_bid` | Place a bid on an auction. |

---

## III. Post-Order API (订单售后处理)

**Base URL**: `https://api.ebay.com/post-order/v2`
**Description**: 处理订单取消、退货、争议和查询。此 API 用于解决买卖双方的售后问题。

### 1. Cancellation (取消订单)

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `approveCancellation` | POST | `/cancellation/{cancelId}/approve` | 批准取消请求 |
| `checkCancellationEligibility` | POST | `/cancellation/check_eligibility` | 检查是否可以取消 |
| `confirmCancellationRefund` | POST | `/cancellation/{cancelId}/confirm` | 买家确认收到退款 ⚠️即将弃用 |
| `createCancellationRequest` | POST | `/cancellation` | 创建取消请求 |
| `getCancellation` | GET | `/cancellation/{cancelId}` | 获取取消详情 |
| `rejectCancellation` | POST | `/cancellation/{cancelId}/reject` | 拒绝取消请求 |
| `searchCancellations` | GET | `/cancellation/search` | 搜索取消记录 |

### 2. Case Management (案例管理)

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `appealCaseDecision` | POST | `/casemanagement/{caseId}/appeal` | 对案例裁决提出申诉 |
| `closeCase` | POST | `/casemanagement/{caseId}/close` | 买家关闭案例 ⚠️即将弃用 |
| `getCase` | GET | `/casemanagement/{caseId}` | 获取案例详情 |
| `issueCaseRefund` | POST | `/casemanagement/{caseId}/issue_refund` | 卖家发起退款 ⚠️即将弃用 |
| `provideCaseShipmentInfo` | POST | `/casemanagement/{caseId}/provide_shipment_info` | 提供物流信息 ⚠️即将弃用 |
| `provideReturnAddress` | POST | `/casemanagement/{caseId}/provide_return_address` | 提供退货地址 ⚠️即将弃用 |
| `searchCases` | GET | `/casemanagement/search` | 搜索案例 |

### 3. Inquiry (查询/咨询)

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `checkInquiryEligibility` | POST | `/inquiry/check_eligibility` | 检查是否可以开启咨询 |
| `closeInquiry` | POST | `/inquiry/{inquiryId}/close` | 关闭咨询 ⚠️即将弃用 |
| `confirmInquiryRefund` | POST | `/inquiry/{inquiryId}/confirm_refund` | 确认退款已收到 ⚠️即将弃用 |
| `createInquiry` | POST | `/inquiry` | 创建咨询 ⚠️即将弃用 |
| `escalateInquiry` | POST | `/inquiry/{inquiryId}/escalate` | 升级咨询为案例 |
| `getInquiry` | GET | `/inquiry/{inquiryId}` | 获取咨询详情 |
| `issueInquiryRefund` | POST | `/inquiry/{inquiryId}/issue_refund` | 发起退款 |
| `provideInquiryRefundInfo` | POST | `/inquiry/{inquiryId}/provide_refund_info` | 提供退款信息 ⚠️即将弃用 |
| `provideInquiryShipmentInfo` | POST | `/inquiry/{inquiryId}/provide_shipment_info` | 提供物流信息 |
| `searchInquiries` | GET | `/inquiry/search` | 搜索咨询 |
| `sendInquiryMessage` | POST | `/inquiry/{inquiryId}/send_message` | 发送消息 |

### 4. Return (退货)

| Method Name | HTTP Method | Path | Summary |
| :--- | :--- | :--- | :--- |
| `addShippingLabelInfo` | POST | `/return/{returnId}/add_shipping_label` | 添加运单信息 |
| `cancelReturnRequest` | POST | `/return/{returnId}/cancel` | 取消退货请求 ⚠️即将弃用 |
| `checkReturnEligibility` | POST | `/return/check_eligibility` | 检查是否可以退货 ⚠️即将弃用 |
| `createReturnRequest` | POST | `/return` | 创建退货请求 |
| `escalateReturn` | POST | `/return/{returnId}/escalate` | 升级退货为案例 |
| `getReturn` | GET | `/return/{returnId}` | 获取退货详情 |
| `getReturnEstimate` | POST | `/return/estimate` | 获取退款和运费估算 |
| `getReturnFiles` | GET | `/return/{returnId}/files` | 获取退货相关文件 |
| `getReturnPreferences` | GET | `/return/preference` | 获取退货偏好设置 |
| `getReturnShippingLabel` | GET | `/return/{returnId}/get_shipping_label` | 获取退货运单 |
| `getShipmentTrackingInfo` | GET | `/return/{returnId}/tracking` | 获取物流跟踪信息 |
| `issueReturnRefund` | POST | `/return/{returnId}/issue_refund` | 发起退款 |
| `markReturnReceived` | POST | `/return/{returnId}/mark_as_received` | 标记已收到退货 |
| `markReturnRefundReceived` | POST | `/return/{returnId}/mark_refund_received` | 标记退款已收到 ⚠️即将弃用 |
| `markReturnShipped` | POST | `/return/{returnId}/mark_as_shipped` | 标记已发货 ⚠️即将弃用 |
| `processReturnRequest` | POST | `/return/{returnId}/decide` | 处理退货请求 |
| `searchReturns` | GET | `/return/search` | 搜索退货 |
| `sendReturnMessage` | POST | `/return/{returnId}/send_message` | 发送消息 |
| `setReturnPreferences` | POST | `/return/preference` | 设置退货偏好 |
| `submitReturnFile` | POST | `/return/{returnId}/file/submit` | 提交退货文件 |
| `uploadReturnFile` | POST | `/return/{returnId}/file/upload` | 上传退货文件 |
| `voidShippingLabel` | POST | `/return/{returnId}/void_shipping_label` | 作废运单 ⚠️即将弃用 |

> **注意**: 标记为 ⚠️即将弃用 的方法将在 2026 年 1-3 月间停用。
