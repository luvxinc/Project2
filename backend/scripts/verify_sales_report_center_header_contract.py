#!/usr/bin/env python3
"""
Verify Sales Report Center Header Contract
============================================
验证销售板块报表中心 Header 对齐标准结构：
1. 路由可达性
2. Header 结构符合标准
3. 无旧 Header 指纹
4. 关键交互元素未被改动
"""
import os
import sys
import re
from pathlib import Path

# [Path Setup]
current_dir = Path(__file__).resolve().parent
backend_dir = current_dir.parent
project_root = backend_dir.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(backend_dir))

# PyMySQL patch
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

import django
django.setup()

from django.test import Client, override_settings
from django.contrib.auth import get_user_model

User = get_user_model()


def get_or_create_test_user():
    username = 'test_admin'
    user, created = User.objects.get_or_create(
        username=username,
        defaults={'is_superuser': True, 'is_staff': True}
    )
    if created:
        user.set_password('testpass123')
        user.save()
    return user


@override_settings(DEBUG=True)
def main():
    print("=" * 60)
    print("Sales Report Center Header Contract Verification")
    print("=" * 60)
    
    client = Client()
    user = get_or_create_test_user()
    client.force_login(user)
    
    all_passed = True
    
    template_path = backend_dir / 'templates' / 'sales' / 'pages' / 'report_center.html'
    
    # ============================================================
    # Test 1: 路由可达性
    # ============================================================
    print("\n1. Route Status Check:")
    print("-" * 40)
    
    response = client.get('/dashboard/sales/report_center/')
    if response.status_code == 200:
        print("  [PASS] /dashboard/sales/report_center/ returns 200")
        content = response.content.decode('utf-8')
    else:
        print(f"  [FAIL] returns {response.status_code}")
        all_passed = False
        content = ""
    
    # ============================================================
    # Test 2: Header 结构符合标准
    # ============================================================
    print("\n2. Header Structure Check:")
    print("-" * 40)
    
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        header_checks = [
            (r'<nav\s+aria-label=["\']breadcrumb["\']', 'Breadcrumb nav'),
            (r'breadcrumb-item.*销售板块', 'Breadcrumb parent link'),
            (r'breadcrumb-item.*active.*报表中心', 'Breadcrumb active item'),
            (r'rounded-circle.*me-3', 'Icon circle container'),
            (r'<h4\s+class=["\']text-white fw-bold mb-1["\']', 'H4 title with correct class'),
            (r'text-white-50 small mb-0', 'Description with correct class'),
            (r'返回销售板块', 'Back button text'),
        ]
        
        found = []
        missing = []
        for pattern, desc in header_checks:
            if re.search(pattern, template_content, re.IGNORECASE | re.DOTALL):
                found.append(desc)
            else:
                missing.append(desc)
        
        if len(missing) == 0:
            print("  [PASS] Header structure matches standard")
        else:
            print(f"  [FAIL] Missing: {missing}")
            all_passed = False
        
        if found:
            print(f"  [INFO] Found: {found}")
    except Exception as e:
        print(f"  [ERROR] {e}")
        all_passed = False
    
    # ============================================================
    # Test 3: 无旧 Header 指纹
    # ============================================================
    print("\n3. No Old Header Check:")
    print("-" * 40)
    
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        old_patterns = [
            (r'opacity-75.*销售板块.*text-success.*报表中心', 'Old gray-green header'),
            (r'text-secondary.*-.*text-success', 'Old module-feature separator'),
        ]
        
        found_old = []
        for pattern, desc in old_patterns:
            if re.search(pattern, template_content, re.IGNORECASE | re.DOTALL):
                found_old.append(desc)
        
        if len(found_old) == 0:
            print("  [PASS] No old header patterns found")
        else:
            print(f"  [FAIL] Old patterns: {found_old}")
            all_passed = False
    except Exception as e:
        print(f"  [ERROR] {e}")
    
    # ============================================================
    # Test 4: 无 history.back()
    # ============================================================
    print("\n4. No history.back() Check:")
    print("-" * 40)
    
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        if 'history.back()' in template_content:
            print("  [FAIL] history.back() found")
            all_passed = False
        else:
            print("  [PASS] No history.back()")
    except Exception as e:
        print(f"  [ERROR] {e}")
    
    # ============================================================
    # Test 5: 关键交互元素存在
    # ============================================================
    print("\n5. Key Interaction Elements Check:")
    print("-" * 40)
    
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        key_elements = [
            (r'id=["\']center-content["\']', 'center-content container'),
            (r'id=["\']center-spinner["\']', 'center-spinner indicator'),
            (r'hx-get=.*center_files', 'HTMX center_files load'),
            (r'hx-trigger=.*load.*reports:updated', 'HTMX trigger'),
            (r'hx-indicator=["\']#center-spinner["\']', 'HTMX indicator'),
        ]
        
        for pattern, desc in key_elements:
            if re.search(pattern, template_content, re.IGNORECASE):
                print(f"  [PASS] {desc} preserved")
            else:
                print(f"  [FAIL] {desc} missing")
                all_passed = False
    except Exception as e:
        print(f"  [ERROR] {e}")
    
    # ============================================================
    # Summary
    # ============================================================
    print("\n" + "=" * 60)
    if all_passed:
        print("RESULT: ALL CHECKS PASSED ✓")
    else:
        print("RESULT: SOME CHECKS FAILED ✗")
    print("=" * 60)
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())
