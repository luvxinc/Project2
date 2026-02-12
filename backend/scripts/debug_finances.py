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
    
    # Endpoint: Seller Funds Summary (Real-time financial status)
    endpoint = "/sell/finances/v1/seller_funds_summary"
    
    print(f"Calling {endpoint}...")
    
    # This API endpoint usually doesn't strictly require params for basic summary, 
    # but filters can be added if needed. Let's try bare first.
    # The Generic 'get' method handles token refresh if config knows the refresh_token
    response = client.get(endpoint)
    
    print("Response Status:", response.get("status_code"))
    if response.get("success"):
        print("Success! Data preview:")
        print(json.dumps(response.get("data"), indent=2))
    else:
        print("Error:")
        print(json.dumps(response.get("error"), indent=2))

if __name__ == "__main__":
    main()
