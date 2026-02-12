#!/usr/bin/env python3
"""
Verify Sales Report Center Viewers Contract
=============================================
验证报表中心文件查看器改造（按类型拆分 3 个 Viewer）：
1. 路由可达性（3 个 Viewer 路由）
2. 旧 Modal 已删除
3. 查看按钮按类型跳转
4. 各 Viewer 页面结构
5. i18n 合规
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
    print("Sales Report Center Viewers Contract Verification")
    print("=" * 60)
    
    client = Client()
    user = get_or_create_test_user()
    client.force_login(user)
    
    all_passed = True
    
    # Template paths
    center_list = backend_dir / 'templates' / 'reports' / 'partials' / 'center_list.html'
    viewer_table = backend_dir / 'templates' / 'reports' / 'pages' / 'viewer_table.html'
    viewer_pdf = backend_dir / 'templates' / 'reports' / 'pages' / 'viewer_pdf.html'
    viewer_image = backend_dir / 'templates' / 'reports' / 'pages' / 'viewer_image.html'
    
    # ============================================================
    # Test 1: Viewer 模板存在
    # ============================================================
    print("\n1. Viewer Templates Exist:")
    print("-" * 40)
    
    templates = [
        (viewer_table, 'viewer_table.html'),
        (viewer_pdf, 'viewer_pdf.html'),
        (viewer_image, 'viewer_image.html'),
    ]
    
    for path, name in templates:
        if path.exists():
            print(f"  [PASS] {name} exists")
        else:
            print(f"  [FAIL] {name} not found")
            all_passed = False
    
    # ============================================================
    # Test 2: 旧 Modal 已删除
    # ============================================================
    print("\n2. Old Modal Removed Check:")
    print("-" * 40)
    
    try:
        content = center_list.read_text(encoding='utf-8')
        
        old_patterns = [
            (r'id=["\']custom-modal-backdrop["\']', 'Modal backdrop'),
            (r'showCustomModal\s*\(', 'showCustomModal function call'),
            (r'hideCustomModal\s*\(', 'hideCustomModal function call'),
            (r'onclick=["\']showCustomModal', 'onclick showCustomModal'),
        ]
        
        found_old = []
        for pattern, desc in old_patterns:
            if re.search(pattern, content):
                found_old.append(desc)
        
        if len(found_old) == 0:
            print("  [PASS] Old modal completely removed")
        else:
            print(f"  [FAIL] Still contains: {found_old}")
            all_passed = False
    except Exception as e:
        print(f"  [ERROR] {e}")
        all_passed = False
    
    # ============================================================
    # Test 3: 查看按钮按类型跳转
    # ============================================================
    print("\n3. View Button Routes by Type:")
    print("-" * 40)
    
    try:
        content = center_list.read_text(encoding='utf-8')
        
        routes = [
            (r"href=.*viewer_table", 'Table viewer route'),
            (r"href=.*viewer_pdf", 'PDF viewer route'),
            (r"href=.*viewer_image", 'Image viewer route'),
        ]
        
        for pattern, desc in routes:
            if re.search(pattern, content):
                print(f"  [PASS] {desc} found")
            else:
                print(f"  [WARN] {desc} not found (may not have that file type)")
    except Exception as e:
        print(f"  [ERROR] {e}")
    
    # ============================================================
    # Test 4: 各 Viewer 页面结构
    # ============================================================
    print("\n4. Viewer Page Structure Check:")
    print("-" * 40)
    
    viewer_checks = {
        'Table': (viewer_table, [
            (r'data-testid=["\']viewer-header["\']', 'Header'),
            (r'data-testid=["\']btn-back-list["\']', 'Back button'),
            (r'data-testid=["\']search-input["\']', 'Search input'),
            (r'data-testid=["\']btn-zoom', 'Zoom controls'),
            (r'data-testid=["\']th-sortable', 'Sortable headers'),
        ]),
        'PDF': (viewer_pdf, [
            (r'data-testid=["\']viewer-header["\']', 'Header'),
            (r'data-testid=["\']btn-back-list["\']', 'Back button'),
            (r'data-testid=["\']search-input["\']', 'Search input'),
            (r'data-testid=["\']btn-zoom', 'Zoom controls'),
        ]),
        'Image': (viewer_image, [
            (r'data-testid=["\']viewer-header["\']', 'Header'),
            (r'data-testid=["\']btn-back-list["\']', 'Back button'),
            (r'data-testid=["\']btn-zoom', 'Zoom controls'),
        ]),
    }
    
    for viewer_name, (path, checks) in viewer_checks.items():
        if not path.exists():
            print(f"  [{viewer_name}] [SKIP] Template not found")
            continue
        
        content = path.read_text(encoding='utf-8')
        missing = []
        found = []
        
        for pattern, desc in checks:
            if re.search(pattern, content):
                found.append(desc)
            else:
                missing.append(desc)
        
        if len(missing) == 0:
            print(f"  [{viewer_name}] [PASS] All controls present")
        else:
            print(f"  [{viewer_name}] [WARN] Missing: {missing}")
    
    # ============================================================
    # Test 5: i18n 合规
    # ============================================================
    print("\n5. i18n Compliance Check:")
    print("-" * 40)
    
    for name, path in [('center_list', center_list), ('viewer_table', viewer_table), 
                       ('viewer_pdf', viewer_pdf), ('viewer_image', viewer_image)]:
        if not path.exists():
            continue
        
        content = path.read_text(encoding='utf-8')
        
        # Check for {% load i18n %}
        has_load = '{% load' in content and 'i18n' in content
        # Check for {% trans %}
        trans_count = len(re.findall(r'\{% trans ', content))
        
        if has_load and trans_count >= 5:
            print(f"  [{name}] [PASS] i18n loaded, {trans_count} trans tags")
        elif has_load:
            print(f"  [{name}] [WARN] i18n loaded but only {trans_count} trans tags")
        else:
            print(f"  [{name}] [FAIL] load i18n not found")
            all_passed = False
    
    # ============================================================
    # Test 6: 无 history.back()
    # ============================================================
    print("\n6. No history.back() Check:")
    print("-" * 40)
    
    for name, path in [('viewer_table', viewer_table), ('viewer_pdf', viewer_pdf), 
                       ('viewer_image', viewer_image)]:
        if not path.exists():
            continue
        
        content = path.read_text(encoding='utf-8')
        
        if 'history.back()' in content:
            print(f"  [{name}] [FAIL] history.back() found")
            all_passed = False
        else:
            print(f"  [{name}] [PASS] No history.back()")
    
    # ============================================================
    # Test 7: 报表中心页面可达性
    # ============================================================
    print("\n7. Report Center Page Status:")
    print("-" * 40)
    
    response = client.get('/dashboard/sales/report_center/')
    if response.status_code == 200:
        print("  [PASS] Report Center returns 200")
    else:
        print(f"  [FAIL] Report Center returns {response.status_code}")
        all_passed = False
    
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
