import os
import sys
import json
import csv
import requests

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pymysql
pymysql.install_as_MySQLdb()

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_config.settings')
import django
django.setup()

from backend.apps.ebay.models import EbayAccount
from core.services.ebay.config import EbayConfig

def main():
    # 1. Setup
    account = EbayAccount.objects.filter(is_active=True).first()
    if not account:
        print("Error: No active EbayAccount found.")
        return
    
    config = EbayConfig.get_production_config()
    config.user_access_token = account.access_token
    
    headers = {
        "Authorization": f"Bearer {config.user_access_token}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    # Date range: 2025-11-01 to 2025-11-30
    start_date = "2025-11-01T00:00:00.000Z"
    end_date = "2025-11-30T23:59:59.000Z"
    
    print(f"Fetching transactions from {start_date} to {end_date}...")
    
    # 2. Fetch all transactions (with pagination)
    all_transactions = []
    offset = 0
    limit = 200
    
    while True:
        url = f"{config.apiz_base_url}/sell/finances/v1/transaction"
        params = {
            "filter": f"transactionDate:[{start_date}..{end_date}]",
            "limit": str(limit),
            "offset": str(offset)
        }
        
        response = requests.get(url, params=params, headers=headers, timeout=60)
        
        if response.status_code != 200:
            print(f"Error fetching transactions: {response.status_code}")
            print(response.text)
            break
        
        data = response.json()
        transactions = data.get("transactions", [])
        total = data.get("total", 0)
        
        all_transactions.extend(transactions)
        print(f"Fetched {len(all_transactions)}/{total} transactions...")
        
        if offset + limit >= total:
            break
        offset += limit
    
    print(f"Total transactions fetched: {len(all_transactions)}")
    
    # 3. Export to CSV - Transactions Detail
    output_dir = "/Users/aaron/Desktop"
    csv_file = os.path.join(output_dir, "ebay_transactions_202511.csv")
    
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        
        # Header
        writer.writerow([
            "transactionId",
            "orderId",
            "transactionType",
            "transactionDate",
            "transactionStatus",
            "amount",
            "currency",
            "bookingEntry",
            "buyerUsername",
            "totalFeeAmount",
            "feeType",
            "transactionMemo",
            "referenceItemId",
            "referenceOrderId",
            "ebayCollectedTax"
        ])
        
        # Data rows
        for tx in all_transactions:
            # Extract references
            refs = tx.get("references", [])
            item_id = ""
            ref_order_id = ""
            for ref in refs:
                if ref.get("referenceType") == "ITEM_ID":
                    item_id = ref.get("referenceId", "")
                elif ref.get("referenceType") == "ORDER_ID":
                    ref_order_id = ref.get("referenceId", "")
            
            writer.writerow([
                tx.get("transactionId", ""),
                tx.get("orderId", ""),
                tx.get("transactionType", ""),
                tx.get("transactionDate", ""),
                tx.get("transactionStatus", ""),
                tx.get("amount", {}).get("value", ""),
                tx.get("amount", {}).get("currency", ""),
                tx.get("bookingEntry", ""),
                tx.get("buyer", {}).get("username", ""),
                tx.get("totalFeeAmount", {}).get("value", ""),
                tx.get("feeType", ""),
                tx.get("transactionMemo", ""),
                item_id,
                ref_order_id,
                tx.get("ebayCollectedTaxAmount", {}).get("value", "")
            ])
    
    print(f"Saved transactions to: {csv_file}")
    
    # 4. Fetch Transaction Summary
    print("\nFetching transaction summary...")
    url = f"{config.apiz_base_url}/sell/finances/v1/transaction_summary"
    params = {
        "filter": f"transactionDate:[{start_date}..{end_date}],transactionStatus:{{PAYOUT}}"
    }
    
    response = requests.get(url, params=params, headers=headers, timeout=30)
    
    if response.status_code == 200:
        summary = response.json()
        
        # Export summary to CSV
        summary_file = os.path.join(output_dir, "ebay_transaction_summary_202511.csv")
        
        with open(summary_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(["Metric", "Count", "Amount", "Currency", "BookingEntry"])
            
            writer.writerow([
                "Credit (Sales)", 
                summary.get("creditCount", 0),
                summary.get("creditAmount", {}).get("value", ""),
                summary.get("creditAmount", {}).get("currency", ""),
                summary.get("creditBookingEntry", "")
            ])
            writer.writerow([
                "Refund",
                summary.get("refundCount", 0),
                summary.get("refundAmount", {}).get("value", ""),
                summary.get("refundAmount", {}).get("currency", ""),
                summary.get("refundBookingEntry", "")
            ])
            writer.writerow([
                "Dispute",
                summary.get("disputeCount", 0),
                summary.get("disputeAmount", {}).get("value", ""),
                summary.get("disputeAmount", {}).get("currency", ""),
                summary.get("disputeBookingEntry", "")
            ])
            writer.writerow([
                "Shipping Label",
                summary.get("shippingLabelCount", 0),
                summary.get("shippingLabelAmount", {}).get("value", ""),
                summary.get("shippingLabelAmount", {}).get("currency", ""),
                summary.get("shippingLabelBookingEntry", "")
            ])
            writer.writerow([
                "Non-Sale Charge (Ads, etc)",
                summary.get("nonSaleChargeCount", 0),
                summary.get("nonSaleChargeAmount", {}).get("value", ""),
                summary.get("nonSaleChargeAmount", {}).get("currency", ""),
                summary.get("nonSaleChargeBookingEntry", "")
            ])
            writer.writerow([
                "Transfer",
                summary.get("transferCount", 0),
                "", "", ""
            ])
            writer.writerow([
                "Adjustment",
                summary.get("adjustmentCount", 0),
                "", "", ""
            ])
        
        print(f"Saved summary to: {summary_file}")
    else:
        print(f"Error fetching summary: {response.status_code}")
        print(response.text)
    
    print("\nDone!")

if __name__ == "__main__":
    main()
