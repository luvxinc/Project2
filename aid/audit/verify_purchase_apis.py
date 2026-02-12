import os
import sys
import django
import json
from datetime import date

# Set up Django environment
sys.path.append('/Users/aaron/Desktop/app/MGMT/backend')  # Add backend to path
# Pymysql Patch
try:
    import pymysql
    pymysql.install_as_MySQLdb()
    import MySQLdb
    if hasattr(MySQLdb, 'version_info') and MySQLdb.version_info < (2, 2, 1):
        setattr(MySQLdb, 'version_info', (2, 2, 1, 'final', 0))
        setattr(MySQLdb, '__version__', '2.2.1')
except ImportError:
    pass

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_config.settings')
django.setup()

from django.test import Client, RequestFactory
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.contrib.contenttypes.models import ContentType
# from core.sys.permission.models import ModulePermission

User = get_user_model()

def run_tests():
    print(">>> Starting Purchase API Verification...")

    # 1. Setup User
    username = 'audit_tester'
    password = 'password123'
    email = 'audit@example.com'
    
    try:
        user = User.objects.get(username=username)
        user.delete()
        print(f"Cleaned up existing user: {username}")
    except User.DoesNotExist:
        pass
        
    user = User.objects.create_user(username=username, email=email, password=password)
    print(f"Created user: {username}")

    # 2. Grant Permissions
    # We need to add permissions to the user. Using the simplified check_perm logic, usually checks 'module.purchase.po.mgmt' etc.
    # In this system, check_perm often checks ModulePermission or standard Django permissions.
    # Let's assume mocking verify_perm or adding entries to ModulePermission if it exists, or just adding group permissions.
    # Since I don't want to mess up the complex permission DB, I might mock check_perm? 
    # But E2E implies using real auth.
    # Let's try to add the permission keys directly if they are stored in a simple way or just force check_perm to return True via mock if easier, 
    # BUT "End to End" implies we shouldn't mock too much.
    # Let's rely on the fact that check_perm checks: user.has_perm(key) OR user is superuser.
    # I'll make the user a superuser for simplicity of API functional testing, 
    # OR better, if I want to test "Forbidden" scenarios, I'd use a normal user.
    # For now, let's verify POSITIVE flows (APIs work), so Superuser is accepted shortcut to bypass permission setup headers.
    user.is_superuser = True
    user.save()
    print("User set as superuser for API access.")

    client = Client()
    client.login(username=username, password=password)

    # 3. Test APIs
    
    # A. PO Mgmt List
    print("\n[Test] PO Mgmt List")
    url = '/dashboard/purchase/api/po_mgmt/list/'
    resp = client.get(url)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Success: {data.get('success')}, Count: {data.get('count')}")
    else:
        print(f"Failed Body: {resp.content.decode()}")

    # B. Send Mgmt List
    print("\n[Test] Send Mgmt List")
    url = '/dashboard/purchase/api/send_mgmt/list/'
    resp = client.get(url)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Success: {data.get('success')}, Count: {data.get('count')}")
    else:
        print(f"Failed Body: {resp.content.decode()}")

    # C. Receive Query - Pending Shipments
    print("\n[Test] Receive Query - Pending Shipments")
    url = '/dashboard/purchase/api/receive/pending_shipments/?receive_date=2026-01-11'
    resp = client.get(url)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Success: {data.get('success')}, Shipments: {len(data.get('shipments', []))}")
    else:
        print(f"Failed Body: {resp.content.decode()}")

    # D. Send Create Query - Check Logistic Num
    print("\n[Test] Send Create - Check Logistic Num")
    url = '/dashboard/purchase/api/send/check_logistic/?logistic_num=TEST_EXIST_123'
    resp = client.get(url)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Success: {data.get('success')}, Exists: {data.get('exists')}")
    else:
        print(f"Failed Body: {resp.content.decode()}")

    # E. Send Create - PO List
    print("\n[Test] Send Create - PO List")
    url = '/dashboard/purchase/api/send/po_list/'
    resp = client.get(url)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Success: {data.get('success')}, PO Count: {len(data.get('data', []))}")
    else:
        print(f"Failed Body: {resp.content.decode()}")

    # F. Receive Mgmt List
    print("\n[Test] Receive Mgmt List")
    url = '/dashboard/purchase/api/receive_mgmt/list/'
    resp = client.get(url)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Success: {data.get('success')}, Count: {data.get('count')}")
    else:
        print(f"Failed Body: {resp.content.decode()}")

    # G. Send Check Availability
    print("\n[Test] Send Check Availability")
    url = '/dashboard/purchase/api/send/check_availability/'
    resp = client.get(url)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Success: {data.get('success')}, Can Send: {data.get('can_send')}")
    else:
        print(f"Failed Body: {resp.content.decode()}")
        
    print("\n>>> Verification Complete.")

if __name__ == '__main__':
    run_tests()
