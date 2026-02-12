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
    
    # Endpoint: Fulfillment API - Get Orders
    endpoint = "/sell/fulfillment/v1/order"
    
    # Needs date range filter usually or it defaults to last 30 days.
    # Let's be explicit to avoid "missing filter" errors.
    # filter=creationdate:[..] or lastmodifieddate:[..]
    
    from datetime import datetime, timedelta
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    start_iso = start_date.strftime('%Y-%m-%dT00:00:00.000Z')
    
    # Note: Use creationdate for Orders
    params = {
        "filter": f"creationdate:[{start_iso}..]", # Orders created from 30 days ago until now
        "limit": "5"
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
