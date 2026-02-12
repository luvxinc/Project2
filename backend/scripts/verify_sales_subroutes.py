#!/usr/bin/env python3
"""
Verify Sales Sub-Routes
========================
验证销售板块 Hub 瘦身 + 4 个子路由落地：
1. 路由可达性（5 个路由返回 200）
2. Hub 瘦身验证（不含原功能块 DOM）
3. Hub 入口卡片验证（4 个链接正确）
4. 子页面功能特征保真验证
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
    """获取或创建测试用户"""
    username = 'test_admin'
    user, created = User.objects.get_or_create(
        username=username,
        defaults={
            'is_superuser': True,
            'is_staff': True,
        }
    )
    if created:
        user.set_password('testpass123')
        user.save()
    return user


@override_settings(DEBUG=True)
def main():
    print("=" * 60)
    print("Sales Sub-Routes Verification")
    print("=" * 60)
    
    client = Client()
    user = get_or_create_test_user()
    client.force_login(user)
    
    all_passed = True
    
    # ============================================================
    # Test 1: 路由可达性
    # ============================================================
    print("\n1. Route Status Codes:")
    print("-" * 40)
    
    routes = [
        ('/dashboard/sales/', 'Hub (销售板块入口)'),
        ('/dashboard/sales/upload/', '交易数据上传'),
        ('/dashboard/sales/report_builder/', '报表生成器'),
        ('/dashboard/sales/report_center/', '报表中心'),
        ('/dashboard/sales/visualization/', '数据交互可视化'),
    ]
    
    contents = {}
    for url, name in routes:
        try:
            response = client.get(url)
            if response.status_code == 200:
                print(f"  [PASS] {name}: 200")
                contents[url] = response.content.decode('utf-8')
            else:
                print(f"  [FAIL] {name}: {response.status_code}")
                all_passed = False
                contents[url] = ""
        except Exception as e:
            print(f"  [FAIL] {name}: {e}")
            all_passed = False
            contents[url] = ""
    
    # ============================================================
    # Test 2: Hub 瘦身验证
    # ============================================================
    print("\n2. Hub Cleanup Check:")
    print("-" * 40)
    
    hub_content = contents.get('/dashboard/sales/')
    if hub_content:
        # 原功能块的关键 DOM 特征（这些不应存在于瘦身后的 Hub）
        old_features = [
            (r'id=["\']etl-tab-content["\']', 'ETL Tab Content Container'),
            (r'id=["\']generator-content["\']', 'Generator Content Container'),
            (r'id=["\']center-content["\']', 'Center Content Container'),
            (r'id=["\']tab-trans["\']', 'Tab Trans Panel'),
            (r'id=["\']tab-reports_gen["\']', 'Tab Reports Gen Panel'),
            (r'id=["\']tab-reports_center["\']', 'Tab Reports Center Panel'),
            (r'hx-get=.*tab_transaction', 'HTMX Transaction Tab Load'),
            (r'hx-get=.*generator_form', 'HTMX Generator Form Load'),
            (r'hx-get=.*center_files', 'HTMX Center Files Load'),
            (r'enterTab\s*\(', 'enterTab JS Function Call'),
        ]
        
        found_old = []
        for pattern, desc in old_features:
            if re.search(pattern, hub_content, re.IGNORECASE):
                found_old.append(desc)
        
        if len(found_old) == 0:
            print("  [PASS] Hub has been successfully slimmed down (no old operational elements)")
        else:
            print(f"  [FAIL] Hub still contains old elements: {found_old}")
            all_passed = False
    else:
        print("  [SKIP] Could not retrieve Hub content")
    
    # ============================================================
    # Test 3: Hub 入口卡片验证
    # ============================================================
    print("\n3. Hub Entry Cards Check:")
    print("-" * 40)
    
    if hub_content:
        entry_urls = [
            '/dashboard/sales/upload/',
            '/dashboard/sales/report_builder/',
            '/dashboard/sales/report_center/',
            '/dashboard/sales/visualization/',
        ]
        
        found_urls = []
        for url in entry_urls:
            if url in hub_content:
                found_urls.append(url)
        
        if len(found_urls) == 4:
            print(f"  [PASS] All 4 entry cards with correct URLs found")
        else:
            missing = set(entry_urls) - set(found_urls)
            print(f"  [FAIL] Missing entry URLs: {missing}")
            all_passed = False
        
        # 检查 Hub Grid 容器
        if 'sales-hub-grid' in hub_content:
            print("  [PASS] Hub grid container found")
        else:
            print("  [WARN] Hub grid container not found")
    else:
        print("  [SKIP] Could not retrieve Hub content")
    
    # ============================================================
    # Test 3.5: Hub Header UI 对齐验证（对标库存 Hub）
    # ============================================================
    print("\n3.5. Hub Header UI Alignment Check:")
    print("-" * 40)
    
    if hub_content:
        # 基准特征（库存 Hub 的 Header 结构）
        header_features = [
            (r'<h4\s+class=["\']text-white fw-bold mb-1["\']', 'H4 title with correct class'),
            (r'fa-cart-shopping.*text-info', 'Module icon with text-info'),
            (r'<p\s+class=["\']text-white-50 mb-0 small["\']', 'Description with correct class'),
            (r'badge.*bg-white.*bg-opacity-10', 'Badge with correct class'),
            (r'fa-arrow-right', 'Arrow right icon (not chevron)'),
        ]
        
        found = []
        missing = []
        for pattern, desc in header_features:
            if re.search(pattern, hub_content):
                found.append(desc)
            else:
                missing.append(desc)
        
        if len(missing) == 0:
            print(f"  [PASS] Hub header aligned with inventory hub standard")
        else:
            print(f"  [WARN] Some header features differ: {missing}")
        
        if found:
            print(f"  [INFO] Found features: {found}")
    else:
        print("  [SKIP] Could not retrieve Hub content")
    
    # ============================================================
    # Test 4: 子页面功能特征保真验证
    # ============================================================
    print("\n4. Sub-page Feature Preservation Check:")
    print("-" * 40)
    
    # 每个子页面必须包含的关键特征（渲染后的 HTML）
    subpage_features = {
        '/dashboard/sales/upload/': [
            (r'id=["\']etl-tab-content["\']', 'ETL Tab Content Container'),
            (r'hx-get=.*/sales/transactions/tab/transaction/', 'HTMX Transaction Tab Load'),
            (r'返回销售板块', 'Back Button'),
        ],
        '/dashboard/sales/report_builder/': [
            (r'id=["\']generator-content["\']', 'Generator Content Container'),
            (r'hx-get=.*/sales/reports/generator/form/', 'HTMX Generator Form Load'),
            (r'返回销售板块', 'Back Button'),
        ],
        '/dashboard/sales/report_center/': [
            (r'id=["\']center-content["\']', 'Center Content Container'),
            (r'id=["\']center-spinner["\']', 'Center Spinner'),
            (r'hx-get=.*/sales/reports/center/files/', 'HTMX Center Files Load'),
            (r'返回销售板块', 'Back Button'),
        ],
        '/dashboard/sales/visualization/': [
            (r'/sales/visuals/', 'Visuals Redirect URL'),
            (r'返回销售板块', 'Back Button'),
        ],
    }
    
    for url, features in subpage_features.items():
        content = contents.get(url)
        page_name = url.split('/')[-2]
        
        if not content:
            print(f"  [{page_name}] [SKIP] Could not retrieve content")
            continue
        
        found = []
        missing = []
        for pattern, desc in features:
            if re.search(pattern, content, re.IGNORECASE):
                found.append(desc)
            else:
                missing.append(desc)
        
        if len(missing) == 0:
            print(f"  [{page_name}] [PASS] All features preserved: {found}")
        else:
            print(f"  [{page_name}] [WARN] Missing: {missing}, Found: {found}")
    
    # ============================================================
    # Test 5: 脱敏检查
    # ============================================================
    print("\n5. Desensitization Check:")
    print("-" * 40)
    
    # 检查所有页面的敏感信息
    sensitive_patterns = [
        (r'/Users/[^\s]+', 'Local path'),
        (r'TemplateSyntaxError', 'Template error'),
        (r'Traceback \(most recent', 'Python traceback'),
    ]
    
    all_clean = True
    for url, content in contents.items():
        if not content:
            continue
        for pattern, desc in sensitive_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                print(f"  [FAIL] {url} contains sensitive info: {desc}")
                all_clean = False
                all_passed = False
    
    if all_clean:
        print("  [PASS] No sensitive information found in any page")
    
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
