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
    
    # Endpoint
    endpoint = "/sell/analytics/v1/traffic_report"
    
    # Params
    # We need a date range. Let's try to infer a valid relatively recent range.
    # eBay allows 90 days.
    # Format: [YYYYMMDD..YYYYMMDD]
    # Let's use a fixed known range or dynamic? Dynamic is safer.
    from datetime import datetime, timedelta
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30) # Restore this line
    start_iso = start_date.strftime('%Y-%m-%dT00:00:00.000Z')
    end_iso = end_date.strftime('%Y-%m-%dT00:00:00.000Z')
    date_str = f"[{start_iso}..{end_iso}]"
    
    # Strategy 2: Query TOP items (sorted by views) to see what HAS data
    params = {
        "dimension": "LISTING",
        "filter": f"marketplace_ids:{{EBAY_US}},date_range:{date_str}",
        "metric": "LISTING_VIEWS_TOTAL,TRANSACTION",
        "sort": "LISTING_VIEWS_TOTAL",
        "limit": "5"
    }
    
    print(f"Calling {endpoint} with params: {params}...")
    
    # The Generic 'get' method handles token refresh if config knows the refresh_token
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
