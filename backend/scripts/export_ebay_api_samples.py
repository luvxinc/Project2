#!/usr/bin/env python3
"""
eBay API 数据导出脚本

导出所有类型 A (时间区间) 和 类型 B (按 ID) 的 API 数据为 CSV
"""

import os
import sys
import json
import csv
from datetime import datetime
from pathlib import Path

import pymysql
pymysql.install_as_MySQLdb()

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_config.settings')

import django
django.setup()

import requests
from core.services.ebay.client import EbayAPIClient
from core.services.ebay.config import EbayConfig
from core.services.ebay.oauth import EbayOAuthManager
from backend.apps.ebay.models import EbayAccount


def flatten_dict(d, parent_key='', sep='.'):
    """将嵌套字典扁平化"""
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        elif isinstance(v, list):
            if v and isinstance(v[0], dict):
                # 只取第一个元素的字段
                items.extend(flatten_dict(v[0], f"{new_key}[0]", sep=sep).items())
            else:
                items.append((new_key, str(v)))
        else:
            items.append((new_key, v))
    return dict(items)


def save_to_csv(data: list, filename: str, output_dir: Path):
    """保存数据到 CSV"""
    if not data:
        print(f"   ⚠️ No data to save for {filename}")
        return
    
    # 扁平化所有记录
    flat_data = [flatten_dict(item) for item in data]
    
    # 获取所有字段名
    all_keys = set()
    for item in flat_data:
        all_keys.update(item.keys())
    
    # 排序字段名
    fieldnames = sorted(all_keys)
    
    filepath = output_dir / filename
    with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(flat_data)
    
    print(f"   ✅ Saved {len(data)} records to {filename}")


def main():
    print("=" * 60)
    print("eBay API 数据导出 (2025年11月)")
    print("=" * 60)
    
    # 输出目录
    output_dir = Path(__file__).parent.parent.parent / "data" / "archive" / "ebay_api_samples"
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"输出目录: {output_dir}")
    
    # 1. 获取账户和配置
    account = EbayAccount.objects.filter(is_active=True).first()
    if not account:
        print("❌ 未找到活跃的 eBay 账户")
        return
    
    config = EbayConfig.get_production_config()
    config.user_access_token = account.access_token
    config.refresh_token = account.refresh_token
    if account.token_expiry:
        config.token_expiry = account.token_expiry.isoformat()
    
    # 刷新 Token
    oauth = EbayOAuthManager(config)
    success, token = oauth.ensure_valid_token()
    if not success:
        result = oauth.refresh_access_token()
        if result.get("success"):
            token = result["access_token"]
            account.access_token = token
            account.save()
        else:
            print(f"❌ Token 刷新失败")
            return
    
    config.user_access_token = token
    client = EbayAPIClient(config=config)
    
    headers_bearer = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    }
    
    headers_iaf = {
        'Authorization': f'IAF {token}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    }
    
    # 时间范围
    start_date = "2025-11-01T00:00:00.000Z"
    end_date = "2025-11-30T23:59:59.999Z"
    
    # 存储一些 ID 供类型 B 使用
    order_ids = []
    payout_ids = []
    cancel_ids = []
    case_ids = []
    inquiry_ids = []
    return_ids = []
    dispute_ids = []
    
    print("\n" + "=" * 60)
    print("类型 A: 按时间区间批量查询")
    print("=" * 60)
    
    # ========== A1. getOrders ==========
    print("\n📡 1. getOrders (Fulfillment API)")
    result = client.get("/sell/fulfillment/v1/order", params={
        "filter": f"creationdate:[{start_date}..{end_date}]",
        "limit": 50,
    })
    if result.get("success"):
        orders = result["data"].get("orders", [])
        order_ids = [o.get("orderId") for o in orders[:10]]  # 取前10个作为样本
        save_to_csv(orders, "A1_getOrders.csv", output_dir)
    
    # ========== A2. getTransactions ==========
    print("\n📡 2. getTransactions (Finances API)")
    resp = requests.get(
        "https://apiz.ebay.com/sell/finances/v1/transaction",
        headers=headers_bearer,
        params={"filter": f"transactionDate:[{start_date}..{end_date}]", "limit": 50},
        timeout=30
    )
    if resp.status_code == 200:
        transactions = resp.json().get("transactions", [])
        payout_ids = list(set([t.get("payoutId") for t in transactions if t.get("payoutId")]))[:5]
        save_to_csv(transactions, "A2_getTransactions.csv", output_dir)
    
    # ========== A3. getPayouts ==========
    print("\n📡 3. getPayouts (Finances API)")
    resp = requests.get(
        "https://apiz.ebay.com/sell/finances/v1/payout",
        headers=headers_bearer,
        params={"filter": f"payoutDate:[{start_date}..{end_date}]", "limit": 50},
        timeout=30
    )
    if resp.status_code == 200:
        payouts = resp.json().get("payouts", [])
        if not payout_ids:
            payout_ids = [p.get("payoutId") for p in payouts[:5]]
        save_to_csv(payouts, "A3_getPayouts.csv", output_dir)
    
    # ========== A4. getPayoutSummary ==========
    print("\n📡 4. getPayoutSummary (Finances API)")
    resp = requests.get(
        "https://apiz.ebay.com/sell/finances/v1/payout_summary",
        headers=headers_bearer,
        params={"filter": f"payoutDate:[{start_date}..{end_date}]"},
        timeout=30
    )
    if resp.status_code == 200:
        summary = resp.json()
        save_to_csv([summary], "A4_getPayoutSummary.csv", output_dir)
    
    # ========== A5. getTransactionSummary ==========
    print("\n📡 5. getTransactionSummary (Finances API)")
    resp = requests.get(
        "https://apiz.ebay.com/sell/finances/v1/transaction_summary",
        headers=headers_bearer,
        params={"filter": f"transactionDate:[{start_date}..{end_date}],transactionStatus:{{PAYOUT}}"},
        timeout=30
    )
    if resp.status_code == 200:
        summary = resp.json()
        save_to_csv([summary], "A5_getTransactionSummary.csv", output_dir)
    
    # ========== A6. getPaymentDisputeSummaries ==========
    print("\n📡 6. getPaymentDisputeSummaries (Fulfillment API)")
    resp = requests.get(
        "https://apiz.ebay.com/sell/fulfillment/v1/payment_dispute_summary",
        headers=headers_bearer,
        params={
            "open_date_from": "2025-07-01T00:00:00.000Z",
            "open_date_to": "2025-12-31T23:59:59.999Z",
            "limit": 50
        },
        timeout=30
    )
    if resp.status_code == 200:
        disputes = resp.json().get("paymentDisputeSummaries", [])
        dispute_ids = [d.get("paymentDisputeId") for d in disputes[:5]]
        save_to_csv(disputes, "A6_getPaymentDisputeSummaries.csv", output_dir)
    
    # ========== A7. searchCancellations ==========
    print("\n📡 7. searchCancellations (Post-Order API)")
    resp = requests.get(
        "https://api.ebay.com/post-order/v2/cancellation/search",
        headers=headers_iaf,
        params={
            "creation_date_range_from": start_date,
            "creation_date_range_to": end_date,
            "limit": 50
        },
        timeout=30
    )
    if resp.status_code == 200:
        cancellations = resp.json().get("cancellations", [])
        cancel_ids = [c.get("cancelId") for c in cancellations[:5]]
        save_to_csv(cancellations, "A7_searchCancellations.csv", output_dir)
    
    # ========== A8. searchCases ==========
    print("\n📡 8. searchCases (Post-Order API)")
    resp = requests.get(
        "https://api.ebay.com/post-order/v2/casemanagement/search",
        headers=headers_iaf,
        params={
            "creation_date_range_from": start_date,
            "creation_date_range_to": end_date,
            "limit": 50
        },
        timeout=30
    )
    if resp.status_code == 200:
        cases = resp.json().get("members", [])
        case_ids = [c.get("caseId") for c in cases[:5]]
        save_to_csv(cases, "A8_searchCases.csv", output_dir)
    
    # ========== A9. searchInquiries ==========
    print("\n📡 9. searchInquiries (Post-Order API)")
    resp = requests.get(
        "https://api.ebay.com/post-order/v2/inquiry/search",
        headers=headers_iaf,
        params={
            "creation_date_range_from": start_date,
            "creation_date_range_to": end_date,
            "limit": 50
        },
        timeout=30
    )
    if resp.status_code == 200:
        inquiries = resp.json().get("members", [])
        inquiry_ids = [i.get("inquiryId") for i in inquiries[:5]]
        save_to_csv(inquiries, "A9_searchInquiries.csv", output_dir)
    
    # ========== A10. searchReturns ==========
    print("\n📡 10. searchReturns (Post-Order API)")
    resp = requests.get(
        "https://api.ebay.com/post-order/v2/return/search",
        headers=headers_iaf,
        params={
            "creation_date_range_from": start_date,
            "creation_date_range_to": end_date,
            "limit": 50
        },
        timeout=30
    )
    if resp.status_code == 200:
        returns = resp.json().get("members", [])
        return_ids = [r.get("returnId") for r in returns[:5]]
        save_to_csv(returns, "A10_searchReturns.csv", output_dir)
    
    # ========== A11. getTrafficReport ==========
    print("\n📡 11. getTrafficReport (Analytics API)")
    result = client.get("/sell/analytics/v1/traffic_report", params={
        "filter": "marketplace_ids:{EBAY_US},date_range:[20251101..20251130]",
        "dimension": "DAY",
        "metric": "LISTING_IMPRESSION_TOTAL,CLICK_THROUGH_RATE,LISTING_VIEWS_TOTAL,SALES_CONVERSION_RATE",
    })
    if result.get("success"):
        records = result["data"].get("records", [])
        # 转换为更友好的格式
        flat_records = []
        for r in records:
            item = {"date": r.get("dimensionValues", [{}])[0].get("value")}
            metrics = result["data"].get("header", {}).get("metrics", [])
            for i, mv in enumerate(r.get("metricValues", [])):
                metric_name = metrics[i].get("key") if i < len(metrics) else f"metric_{i}"
                item[metric_name] = mv.get("value")
            flat_records.append(item)
        save_to_csv(flat_records, "A11_getTrafficReport.csv", output_dir)
    
    # ========================================
    # 类型 B: 按 ID 查询详情 (关联数据)
    # ========================================
    print("\n" + "=" * 60)
    print("类型 B: 按 ID 查询详情 (关联数据)")
    print("=" * 60)
    
    # ========== B1. getOrder (订单详情) ==========
    print("\n📡 B1. getOrder (订单详情)")
    order_details = []
    for oid in order_ids[:5]:
        if oid:
            result = client.get(f"/sell/fulfillment/v1/order/{oid}")
            if result.get("success"):
                order_details.append(result["data"])
    save_to_csv(order_details, "B1_getOrder_details.csv", output_dir)
    
    # ========== B2. getShippingFulfillments (发货信息) ==========
    print("\n📡 B2. getShippingFulfillments (发货信息)")
    fulfillments = []
    for oid in order_ids[:5]:
        if oid:
            result = client.get(f"/sell/fulfillment/v1/order/{oid}/shipping_fulfillment")
            if result.get("success"):
                for f in result["data"].get("fulfillments", []):
                    f["orderId"] = oid
                    fulfillments.append(f)
    save_to_csv(fulfillments, "B2_getShippingFulfillments.csv", output_dir)
    
    # ========== B3. getCancellation (取消详情) ==========
    print("\n📡 B3. getCancellation (取消详情)")
    cancel_details = []
    for cid in cancel_ids[:5]:
        if cid:
            resp = requests.get(
                f"https://api.ebay.com/post-order/v2/cancellation/{cid}",
                headers=headers_iaf,
                timeout=30
            )
            if resp.status_code == 200:
                cancel_details.append(resp.json())
    save_to_csv(cancel_details, "B3_getCancellation_details.csv", output_dir)
    
    # ========== B4. getCase (案例详情) ==========
    print("\n📡 B4. getCase (案例详情)")
    case_details = []
    for cid in case_ids[:5]:
        if cid:
            resp = requests.get(
                f"https://api.ebay.com/post-order/v2/casemanagement/{cid}",
                headers=headers_iaf,
                timeout=30
            )
            if resp.status_code == 200:
                case_details.append(resp.json())
    save_to_csv(case_details, "B4_getCase_details.csv", output_dir)
    
    # ========== B5. getInquiry (咨询详情) ==========
    print("\n📡 B5. getInquiry (咨询详情)")
    inquiry_details = []
    for iid in inquiry_ids[:5]:
        if iid:
            resp = requests.get(
                f"https://api.ebay.com/post-order/v2/inquiry/{iid}",
                headers=headers_iaf,
                timeout=30
            )
            if resp.status_code == 200:
                inquiry_details.append(resp.json())
    save_to_csv(inquiry_details, "B5_getInquiry_details.csv", output_dir)
    
    # ========== B6. getReturn (退货详情) ==========
    print("\n📡 B6. getReturn (退货详情)")
    return_details = []
    for rid in return_ids[:5]:
        if rid:
            resp = requests.get(
                f"https://api.ebay.com/post-order/v2/return/{rid}",
                headers=headers_iaf,
                timeout=30
            )
            if resp.status_code == 200:
                return_details.append(resp.json())
    save_to_csv(return_details, "B6_getReturn_details.csv", output_dir)
    
    # ========== B7. getPaymentDispute (争议详情) ==========
    print("\n📡 B7. getPaymentDispute (争议详情)")
    dispute_details = []
    for did in dispute_ids[:5]:
        if did:
            resp = requests.get(
                f"https://apiz.ebay.com/sell/fulfillment/v1/payment_dispute/{did}",
                headers=headers_bearer,
                timeout=30
            )
            if resp.status_code == 200:
                dispute_details.append(resp.json())
    save_to_csv(dispute_details, "B7_getPaymentDispute_details.csv", output_dir)
    
    # ========== 汇总 ==========
    print("\n" + "=" * 60)
    print("📊 导出完成!")
    print("=" * 60)
    print(f"输出目录: {output_dir}")
    
    # 列出生成的文件
    csv_files = sorted(output_dir.glob("*.csv"))
    print(f"\n生成的 CSV 文件 ({len(csv_files)} 个):")
    for f in csv_files:
        size = f.stat().st_size
        print(f"  - {f.name} ({size:,} bytes)")
    
    # 输出关联关系
    print("\n📎 数据关联关系:")
    print(f"  - 使用的 Order IDs: {order_ids[:3]}...")
    print(f"  - 使用的 Cancel IDs: {cancel_ids[:3]}...")
    print(f"  - 使用的 Case IDs: {case_ids[:3]}...")
    print(f"  - 使用的 Return IDs: {return_ids[:3]}...")


if __name__ == "__main__":
    main()
