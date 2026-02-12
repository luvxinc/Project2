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
    
    print(f"Fetching orders from {start_date} to {end_date}...")
    
    # 2. Fetch all orders (with pagination)
    # Note: Orders API uses 'api.ebay.com', not 'apiz'
    all_orders = []
    offset = 0
    limit = 200
    
    while True:
        url = f"{config.api_base_url}/sell/fulfillment/v1/order"
        params = {
            "filter": f"creationdate:[{start_date}..{end_date}]",
            "limit": str(limit),
            "offset": str(offset)
        }
        
        response = requests.get(url, params=params, headers=headers, timeout=60)
        
        if response.status_code != 200:
            print(f"Error fetching orders: {response.status_code}")
            print(response.text)
            break
        
        data = response.json()
        orders = data.get("orders", [])
        total = data.get("total", 0)
        
        all_orders.extend(orders)
        print(f"Fetched {len(all_orders)}/{total} orders...")
        
        if offset + limit >= total:
            break
        offset += limit
    
    print(f"Total orders fetched: {len(all_orders)}")
    
    # 3. Export to CSV
    output_dir = "/Users/aaron/Desktop/app/MGMT/aid/API"
    csv_file = os.path.join(output_dir, "ebay_orders_202511.csv")
    
    with open(csv_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        
        # Header
        writer.writerow([
            "orderId",
            "legacyOrderId",
            "creationDate",
            "lastModifiedDate",
            "orderFulfillmentStatus",
            "orderPaymentStatus",
            "buyerUsername",
            "buyerEmail",
            "salesRecordReference",
            "totalAmount",
            "currency",
            "totalFeeBasisAmount",
            "totalMarketplaceFee",
            "lineItemCount",
            "lineItemId",
            "itemTitle",
            "itemSku",
            "quantity",
            "lineItemPrice",
            "shippingCost",
            "shipToCity",
            "shipToState",
            "shipToPostalCode",
            "shipToCountry"
        ])
        
        # Data rows - flatten line items
        for order in all_orders:
            order_id = order.get("orderId", "")
            legacy_order_id = order.get("legacyOrderId", "")
            creation_date = order.get("creationDate", "")
            last_modified = order.get("lastModifiedDate", "")
            fulfillment_status = order.get("orderFulfillmentStatus", "")
            payment_status = order.get("orderPaymentStatus", "")
            
            buyer = order.get("buyer", {})
            buyer_username = buyer.get("username", "")
            buyer_email = buyer.get("buyerRegistrationAddress", {}).get("email", "")
            
            sales_record = order.get("salesRecordReference", "")
            
            pricing = order.get("pricingSummary", {})
            total_amount = pricing.get("total", {}).get("value", "")
            currency = pricing.get("total", {}).get("currency", "")
            
            total_fee_basis = order.get("totalFeeBasisAmount", {}).get("value", "")
            total_marketplace_fee = order.get("totalMarketplaceFee", {}).get("value", "")
            
            line_items = order.get("lineItems", [])
            line_item_count = len(line_items)
            
            # Shipping address
            ship_to = order.get("fulfillmentStartInstructions", [{}])[0].get("shippingStep", {}).get("shipTo", {}).get("contactAddress", {})
            ship_city = ship_to.get("city", "")
            ship_state = ship_to.get("stateOrProvince", "")
            ship_postal = ship_to.get("postalCode", "")
            ship_country = ship_to.get("countryCode", "")
            
            if line_items:
                for item in line_items:
                    writer.writerow([
                        order_id,
                        legacy_order_id,
                        creation_date,
                        last_modified,
                        fulfillment_status,
                        payment_status,
                        buyer_username,
                        buyer_email,
                        sales_record,
                        total_amount,
                        currency,
                        total_fee_basis,
                        total_marketplace_fee,
                        line_item_count,
                        item.get("lineItemId", ""),
                        item.get("title", ""),
                        item.get("sku", ""),
                        item.get("quantity", ""),
                        item.get("lineItemCost", {}).get("value", ""),
                        item.get("deliveryCost", {}).get("shippingCost", {}).get("value", ""),
                        ship_city,
                        ship_state,
                        ship_postal,
                        ship_country
                    ])
            else:
                # No line items
                writer.writerow([
                    order_id,
                    legacy_order_id,
                    creation_date,
                    last_modified,
                    fulfillment_status,
                    payment_status,
                    buyer_username,
                    buyer_email,
                    sales_record,
                    total_amount,
                    currency,
                    total_fee_basis,
                    total_marketplace_fee,
                    0,
                    "", "", "", "", "", "",
                    ship_city, ship_state, ship_postal, ship_country
                ])
    
    print(f"Saved orders to: {csv_file}")
    print("\nDone!")

if __name__ == "__main__":
    main()
