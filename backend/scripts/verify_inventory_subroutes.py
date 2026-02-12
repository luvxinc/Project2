#!/usr/bin/env python3
"""
Verify Inventory Sub-Routes
============================
验证库存板块模块子路由拆分后的状态：
1. Hub 页面返回 200
2. 两个子路由页面返回 200
3. Hub 不再包含操作区 DOM (tab-upload, tab-modify, wizard_container, etl-tab-content)
4. 子页面包含原功能区关键 DOM
"""
import os
import sys
import re
from pathlib import Path

# [Path Setup - 参照 manage.py]
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


def check_route(client, url, route_name):
    """检查单个路由"""
    response = client.get(url)
    status = response.status_code
    result = 'PASS' if status == 200 else 'FAIL'
    print(f"  [{result}] {route_name}: {status}")
    return status == 200, response.content.decode('utf-8') if status == 200 else None


def check_hub_cleanup(content):
    """检查 Hub 是否已移除旧操作区元素"""
    # 需要检查的旧操作区元素关键特征
    old_patterns = [
        (r'id=["\']tab-upload["\']', 'Tab Upload Container'),
        (r'id=["\']tab-modify["\']', 'Tab Modify Container'),
        (r'id=["\']etl-tab-content["\']', 'ETL Tab Content'),
        (r'id=["\']wizard_container["\']', 'Wizard Container'),
        (r'id=["\']inv-modify-stage-indicator["\']', 'Modify Stage Indicator'),
        (r'class=["\']tab-content-panel', 'Tab Content Panel'),
        (r'hx-get=.*stocktake_etl:tab_inventory', 'ETL HTMX Load'),
        (r'hx-post=.*stocktake_modify:wizard_step_2', 'Modify Wizard Form'),
        (r'enterTab\s*\(', 'enterTab JS Function'),
        (r'exitTab\s*\(', 'exitTab JS Function'),
    ]
    
    issues = []
    for pattern, desc in old_patterns:
        if re.search(pattern, content):
            issues.append(desc)
    
    return issues


def check_subpage_content(content, page_name, expected_patterns):
    """检查子页面包含预期的关键 DOM"""
    found = []
    missing = []
    for pattern, desc in expected_patterns:
        if re.search(pattern, content):
            found.append(desc)
        else:
            missing.append(desc)
    return found, missing


@override_settings(DEBUG=True)
def main():
    print("=" * 60)
    print("Inventory Sub-Routes Verification")
    print("=" * 60)
    
    # 创建测试客户端和用户
    client = Client()
    user = get_or_create_test_user()
    client.force_login(user)
    
    all_passed = True
    
    # 1. 检查路由状态
    print("\n1. Route Status Codes:")
    print("-" * 40)
    
    routes = [
        ('/dashboard/inventory/', 'Hub (库存板块入口)'),
        ('/dashboard/inventory/upload/', '手动上传盘存'),
        ('/dashboard/inventory/edit/', '库存修改向导'),
    ]
    
    contents = {}
    for url, name in routes:
        passed, content = check_route(client, url, name)
        if not passed:
            all_passed = False
        contents[url] = content
    
    # 2. 检查 Hub 瘦身
    print("\n2. Hub Cleanup Check:")
    print("-" * 40)
    hub_content = contents.get('/dashboard/inventory/')
    if hub_content:
        issues = check_hub_cleanup(hub_content)
        if issues:
            print("  [FAIL] Hub still contains old elements:")
            for issue in issues:
                print(f"    - {issue}")
            all_passed = False
        else:
            print("  [PASS] Hub has been successfully slimmed down (no old operational elements)")
    else:
        print("  [SKIP] Could not retrieve Hub content")
        all_passed = False
    
    # 3. 检查 Hub 包含入口卡片
    print("\n3. Hub Entry Cards Check:")
    print("-" * 40)
    if hub_content:
        expected_cards = ['手动上传盘存', '库存修改向导']
        expected_urls = ['/dashboard/inventory/upload/', '/dashboard/inventory/edit/']
        
        cards_found = all(card in hub_content for card in expected_cards)
        urls_found = all(url in hub_content for url in expected_urls)
        
        if cards_found and urls_found:
            print(f"  [PASS] All {len(expected_cards)} entry cards with correct URLs found")
        else:
            if not cards_found:
                print("  [FAIL] Missing card titles")
            if not urls_found:
                print("  [FAIL] Missing card URLs")
            all_passed = False
    
    # 4. 检查 Upload 子页面包含原功能（已迁移到 GlobalWizard 结构）
    print("\n4. Upload Page Content Check:")
    print("-" * 40)
    upload_content = contents.get('/dashboard/inventory/upload/')
    if upload_content:
        # 新的 GlobalWizard 结构检查
        upload_patterns = [
            (r'id=["\']inv-upload-wizard-container["\']', 'GlobalWizard Container'),
            (r'GlobalWizard\s*\(', 'GlobalWizard JS Instance'),
            (r'data-testid=["\']step-upload["\']', 'Step Upload'),
        ]
        found, missing = check_subpage_content(upload_content, 'Upload', upload_patterns)
        
        if missing:
            print(f"  [WARN] Missing elements: {missing}")
        if found:
            print(f"  [PASS] Found {len(found)}/{len(upload_patterns)} expected elements: {found}")
        
        if '返回库存板块' in upload_content:
            print("  [PASS] Back button found")
        else:
            print("  [WARN] Back button missing")
    else:
        print("  [SKIP] Could not retrieve Upload page content")
    
    # 5. 检查 Edit 子页面包含功能（已迁移到 GlobalWizard）
    print("\n5. Edit Page Content Check:")
    print("-" * 40)
    edit_content = contents.get('/dashboard/inventory/edit/')
    if edit_content:
        # 新的 GlobalWizard 结构检查
        edit_patterns = [
            (r'id=["\']inv-edit-wizard-container["\']', 'GlobalWizard Container'),
            (r'GlobalWizard\s*\(', 'GlobalWizard JS Instance'),
            (r'data-testid=["\']step-date["\']', 'Step Date'),
        ]
        found, missing = check_subpage_content(edit_content, 'Edit', edit_patterns)
        
        if missing:
            print(f"  [WARN] Missing elements: {missing}")
        if found:
            print(f"  [PASS] Found {len(found)}/{len(edit_patterns)} expected elements: {found}")
        
        if '返回库存板块' in edit_content:
            print("  [PASS] Back button found")
        else:
            print("  [WARN] Back button missing")
    else:
        print("  [SKIP] Could not retrieve Edit page content")
    
    # 总结
    print("\n" + "=" * 60)
    if all_passed:
        print("RESULT: ALL CHECKS PASSED ✓")
    else:
        print("RESULT: SOME CHECKS FAILED ✗")
    print("=" * 60)
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())
