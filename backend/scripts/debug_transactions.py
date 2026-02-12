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
    
    # Endpoint: Finances API - Get Transactions
    # NOTE: Finances API requires 'apiz' subdomain, not 'api'
    
    from datetime import datetime, timedelta
    import requests
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    start_iso = start_date.strftime('%Y-%m-%dT00:00:00.000Z')
    end_iso = end_date.strftime('%Y-%m-%dT23:59:59.000Z')
    
    # Use apiz subdomain
    base_url = config.apiz_base_url
    endpoint = "/sell/finances/v1/transaction"
    full_url = f"{base_url}{endpoint}"
    
    params = {
        "filter": f"transactionDate:[{start_iso}..{end_iso}]",
        "limit": "5"
    }
    
    headers = {
        "Authorization": f"Bearer {config.user_access_token}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }
    
    print(f"Calling {full_url} with params: {params}...")
    
    try:
        response = requests.get(full_url, params=params, headers=headers, timeout=30)
        print("Response Status:", response.status_code)
        if response.status_code == 200:
            print("Success! Data preview:")
            print(json.dumps(response.json(), indent=2))
        else:
            print("Error:")
            print(json.dumps(response.json() if response.text else {"message": "No response body"}, indent=2))
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    main()
