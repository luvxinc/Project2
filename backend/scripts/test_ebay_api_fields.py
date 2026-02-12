#!/usr/bin/env python3
"""
eBay API 字段探测脚本

用途: 获取 2025年11月 的数据，记录每个 API 返回的字段结构
"""

import os
import sys
import json
import requests
from datetime import datetime, timedelta
from pathlib import Path

# Django setup
import pymysql
pymysql.install_as_MySQLdb()

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_config.settings')

import django
django.setup()

from core.services.ebay.client import EbayAPIClient
from core.services.ebay.config import EbayConfig
from core.services.ebay.oauth import EbayOAuthManager
from backend.apps.ebay.models import EbayAccount


def flatten_keys(obj, max_depth=2):
    """获取 JSON 对象的顶层和关键嵌套字段"""
    keys = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            keys.append(k)
            if isinstance(v, dict) and max_depth > 1:
                for sub_k in v.keys():
                    keys.append(f"{k}.{sub_k}")
            elif isinstance(v, list) and v and isinstance(v[0], dict) and max_depth > 1:
                for sub_k in v[0].keys():
                    keys.append(f"{k}[].{sub_k}")
    return keys


def test_api_bearer(client: EbayAPIClient, name: str, endpoint: str, params: dict):
    """使用 Bearer Token 测试 API (通过 client 自动刷新)"""
    print(f"\n{'='*60}")
    print(f"📡 测试: {name}")
    print(f"   Endpoint: {endpoint}")
    
    response = client.get(endpoint, params=params)
    
    print(f"   Status: {response.get('status_code')}")
    
    if response.get("success"):
        data = response.get("data", {})
        
        # 自动检测数据数组
        items = []
        item_key = None
        for key in ["orders", "transactions", "payouts", "paymentDisputeSummaries",
                   "cancellations", "members", "inquiries", "returns", "dimensionValues"]:
            if key in data:
                items = data.get(key, [])
                item_key = key
                break
        
        total = data.get("total", len(items))
        print(f"   ✅ 成功! 记录数: {total}")
        
        # 获取字段
        top_fields = list(data.keys())
        item_fields = flatten_keys(items[0]) if items else []
        
        return {
            "success": True,
            "status_code": 200,
            "total": total,
            "item_key": item_key,
            "top_level_fields": top_fields,
            "item_fields": item_fields,
            "sample_item": items[0] if items else None,
        }
    else:
        error = response.get("error", {})
        print(f"   ❌ 失败: {error}")
        return {
            "success": False,
            "status_code": response.get("status_code"),
            "error": str(error)[:200],
        }


def test_api_direct(access_token: str, name: str, url: str, params: dict, auth_type: str = "Bearer"):
    """直接请求 API (不经过 client)"""
    print(f"\n{'='*60}")
    print(f"📡 测试: {name}")
    print(f"   URL: {url}")
    
    headers = {
        "Authorization": f"{auth_type} {access_token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    }
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # 自动检测数据数组
            items = []
            item_key = None
            for key in ["transactions", "payouts", "paymentDisputeSummaries",
                       "cancellations", "members", "inquiries", "returns"]:
                if key in data:
                    items = data.get(key, [])
                    item_key = key
                    break
            
            total = data.get("total", len(items))
            print(f"   ✅ 成功! 记录数: {total}")
            
            top_fields = list(data.keys())
            item_fields = flatten_keys(items[0]) if items else []
            
            return {
                "success": True,
                "status_code": 200,
                "total": total,
                "item_key": item_key,
                "top_level_fields": top_fields,
                "item_fields": item_fields,
                "sample_item": items[0] if items else None,
            }
        else:
            print(f"   ❌ 失败: {response.text[:200]}")
            return {
                "success": False,
                "status_code": response.status_code,
                "error": response.text[:200],
            }
    except Exception as e:
        print(f"   ❌ 异常: {e}")
        return {"success": False, "error": str(e)}


def main():
    # 时间范围: 2025年11月
    start_date = "2025-11-01T00:00:00.000Z"
    end_date = "2025-11-30T23:59:59.999Z"
    
    print("=" * 60)
    print("eBay API 字段探测 (2025年11月)")
    print("=" * 60)
    
    # 1. 获取账户和配置
    account = EbayAccount.objects.filter(is_active=True).first()
    if not account:
        print("❌ 未找到活跃的 eBay 账户")
        return
    
    print(f"✅ 使用账户: {account.ebay_username} ({account.environment})")
    
    # 2. 配置
    if account.environment == 'sandbox':
        config = EbayConfig.get_sandbox_config()
    else:
        config = EbayConfig.get_production_config()
    
    config.user_access_token = account.access_token
    config.refresh_token = account.refresh_token
    if account.token_expiry:
        config.token_expiry = account.token_expiry.isoformat()
    
    # 3. 创建客户端 (会自动刷新过期 token)
    client = EbayAPIClient(config=config)
    
    # 4. 先通过一个 API 调用让 client 刷新 token
    print("\n🔄 检查并刷新 Token...")
    oauth = EbayOAuthManager(config)
    success, token_or_error = oauth.ensure_valid_token()
    
    if not success:
        print(f"   Token 已过期，尝试刷新...")
        refresh_result = oauth.refresh_access_token()
        if refresh_result.get("success"):
            access_token = refresh_result["access_token"]
            # 更新数据库
            account.access_token = access_token
            if refresh_result.get("refresh_token"):
                account.refresh_token = refresh_result["refresh_token"]
            account.save()
            print(f"   ✅ Token 刷新成功!")
        else:
            print(f"   ❌ Token 刷新失败: {refresh_result.get('error_description')}")
            return
    else:
        access_token = token_or_error
        print(f"   ✅ Token 有效!")
    
    # 更新 client 的 config
    config.user_access_token = access_token
    client = EbayAPIClient(config=config)
    
    results = {}
    
    # ========== 1. Fulfillment API - getOrders ==========
    results["getOrders"] = test_api_bearer(
        client,
        name="Fulfillment API - getOrders",
        endpoint="/sell/fulfillment/v1/order",
        params={
            "filter": f"creationdate:[{start_date}..{end_date}]",
            "limit": 5,
        }
    )
    
    # ========== 2. Finances API - getTransactions ==========
    results["getTransactions"] = test_api_direct(
        access_token,
        name="Finances API - getTransactions",
        url="https://apiz.ebay.com/sell/finances/v1/transaction",
        params={
            "filter": f"transactionDate:[{start_date}..{end_date}]",
            "limit": 5,
        },
        auth_type="Bearer"
    )
    
    # ========== 3. Finances API - getPayouts ==========
    results["getPayouts"] = test_api_direct(
        access_token,
        name="Finances API - getPayouts",
        url="https://apiz.ebay.com/sell/finances/v1/payout",
        params={
            "filter": f"payoutDate:[{start_date}..{end_date}]",
            "limit": 5,
        },
        auth_type="Bearer"
    )
    
    # ========== 4. Finances API - getPayoutSummary ==========
    results["getPayoutSummary"] = test_api_direct(
        access_token,
        name="Finances API - getPayoutSummary",
        url="https://apiz.ebay.com/sell/finances/v1/payout_summary",
        params={
            "filter": f"payoutDate:[{start_date}..{end_date}]",
        },
        auth_type="Bearer"
    )
    
    # ========== 5. Finances API - getTransactionSummary ==========
    results["getTransactionSummary"] = test_api_direct(
        access_token,
        name="Finances API - getTransactionSummary",
        url="https://apiz.ebay.com/sell/finances/v1/transaction_summary",
        params={
            "filter": f"transactionDate:[{start_date}..{end_date}],transactionStatus:{{PAYOUT}}",
        },
        auth_type="Bearer"
    )
    
    # ========== 6. Fulfillment API - getPaymentDisputeSummaries ==========
    results["getPaymentDisputeSummaries"] = test_api_direct(
        access_token,
        name="Fulfillment API - getPaymentDisputeSummaries",
        url="https://apiz.ebay.com/sell/fulfillment/v1/payment_dispute_summary",
        params={
            "open_date_from": "2025-11-01T00:00:00.000Z",
            "open_date_to": "2025-11-30T23:59:59.999Z",
            "limit": 5,
        },
        auth_type="Bearer"
    )
    
    # ========== 7. Post-Order API - searchCancellations ==========
    results["searchCancellations"] = test_api_direct(
        access_token,
        name="Post-Order API - searchCancellations",
        url="https://api.ebay.com/post-order/v2/cancellation/search",
        params={
            "creation_date_range_from": "2025-11-01T00:00:00.000Z",
            "creation_date_range_to": "2025-11-30T23:59:59.999Z",
            "limit": 5,
        },
        auth_type="IAF"
    )
    
    # ========== 8. Post-Order API - searchCases ==========
    results["searchCases"] = test_api_direct(
        access_token,
        name="Post-Order API - searchCases",
        url="https://api.ebay.com/post-order/v2/casemanagement/search",
        params={
            "creation_date_range_from": "2025-11-01T00:00:00.000Z",
            "creation_date_range_to": "2025-11-30T23:59:59.999Z",
            "limit": 5,
        },
        auth_type="IAF"
    )
    
    # ========== 9. Post-Order API - searchInquiries ==========
    results["searchInquiries"] = test_api_direct(
        access_token,
        name="Post-Order API - searchInquiries",
        url="https://api.ebay.com/post-order/v2/inquiry/search",
        params={
            "creation_date_range_from": "2025-11-01T00:00:00.000Z",
            "creation_date_range_to": "2025-11-30T23:59:59.999Z",
            "limit": 5,
        },
        auth_type="IAF"
    )
    
    # ========== 10. Post-Order API - searchReturns ==========
    results["searchReturns"] = test_api_direct(
        access_token,
        name="Post-Order API - searchReturns",
        url="https://api.ebay.com/post-order/v2/return/search",
        params={
            "creation_date_range_from": "2025-11-01T00:00:00.000Z",
            "creation_date_range_to": "2025-11-30T23:59:59.999Z",
            "limit": 5,
        },
        auth_type="IAF"
    )
    
    # ========== 11. Analytics API - getTrafficReport ==========
    results["getTrafficReport"] = test_api_bearer(
        client,
        name="Analytics API - getTrafficReport",
        endpoint="/sell/analytics/v1/traffic_report",
        params={
            "filter": "date_range:[2025-11-01..2025-11-30]",
            "dimension": "DAY",
            "metric": "LISTING_IMPRESSIONS_TOTAL,CLICK_THROUGH_RATE",
        }
    )
    
    # ========== 汇总输出 ==========
    print("\n" + "=" * 60)
    print("📊 测试结果汇总")
    print("=" * 60)
    
    success_count = 0
    for api_name, result in results.items():
        status = "✅" if result.get("success") else "❌"
        total = result.get("total", 0)
        print(f"{status} {api_name}: {total} 条记录")
        if result.get("success"):
            success_count += 1
    
    print(f"\n成功: {success_count}/{len(results)}")
    
    # 保存结果到文件
    output_file = Path(__file__).parent / "ebay_api_fields_result.json"
    
    summary = {}
    for api_name, result in results.items():
        summary[api_name] = {
            "success": result.get("success"),
            "status_code": result.get("status_code"),
            "total": result.get("total", 0),
            "item_key": result.get("item_key"),
            "top_level_fields": result.get("top_level_fields", []),
            "item_fields": result.get("item_fields", []),
            "error": result.get("error") if not result.get("success") else None,
        }
    
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    
    print(f"\n📁 结果已保存到: {output_file}")
    
    # 输出字段详情
    print("\n" + "=" * 60)
    print("📋 各 API 返回字段详情")
    print("=" * 60)
    
    for api_name, result in results.items():
        if result.get("success"):
            print(f"\n### {api_name}")
            print(f"数据数组键: `{result.get('item_key')}`")
            if result.get('item_fields'):
                print(f"字段列表 ({len(result.get('item_fields'))}):")
                for field in result.get('item_fields', []):
                    print(f"  - `{field}`")


if __name__ == "__main__":
    main()
