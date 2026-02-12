import os
import sys
import django
import json
import pymysql
pymysql.install_as_MySQLdb()

# Add backend to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_config.settings')
django.setup()

from core.services.ebay.client import EbayAPIClient
from core.services.ebay.config import EbayConfig, EbayEnvironment
from backend.apps.ebay.models import EbayAccount

def main():
    print("Initializing...")
    
    # 1. Fetch Account
    account = EbayAccount.objects.filter(is_active=True).first()
    if not account:
        print("Error: No active EbayAccount found in database.")
        return

    print(f"Using account: {account.ebay_username} ({account.environment})")
    
    # 2. Config
    if account.environment == 'sandbox':
        config = EbayConfig.get_sandbox_config()
    else:
        config = EbayConfig.get_production_config()
    
    # Overlay tokens
    config.user_access_token = account.access_token
    config.refresh_token = account.refresh_token
    if account.token_expiry:
        config.token_expiry = account.token_expiry.isoformat()
    
    # 3. Client
    client = EbayAPIClient(config=config)
    
    # Endpoint: Traffic Report
    endpoint = "/sell/analytics/v1/traffic_report"
    
    # Try a minimal approach:
    # 1. No listing filter (Account level)
    # 2. Key metrics only
    # 3. Simple date range (last 7 days to maximize chance of live data)
    
    from datetime import datetime, timedelta
    end_date = datetime.now()
    start_date = end_date - timedelta(days=7)
    
    # Try the YYYYMMDD format again as some docs say filters prefer it over ISO
    date_str = f"[{start_date.strftime('%Y%m%d')}..{end_date.strftime('%Y%m%d')}]"
    
    params = {
        "dimension": "DAY",
        "filter": f"marketplace_ids:{{EBAY_US}},date_range:{date_str}", 
        "metric": "LISTING_VIEWS_TOTAL,CLICK_THROUGH_RATE,SALES_CONVERSION_RATE,TRANSACTION"
    }
    
    print(f"Calling {endpoint} with params: {params}...")
    response = client.get(endpoint, params=params)
    
    print("Response Status:", response.get("status_code"))
    if response.get("success"):
        print("Success! Data preview:")
        print(json.dumps(response.get("data"), indent=2))
    else:
        print("Error:")
        print(json.dumps(response.get("error"), indent=2))

if __name__ == "__main__":
    main()
