#!/usr/bin/env python3
"""
Verify DB Admin Sub-Routes
==========================
验证 DB Admin 模块子路由拆分后的状态：
1. Hub 页面返回 200
2. 四个子路由页面返回 200
3. Hub 不再包含旧 Tab/Content/Modal 元素
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
    return status == 200


def check_hub_cleanup(content):
    """检查 Hub 是否已移除旧元素"""
    # 需要检查的旧元素关键特征
    old_patterns = [
        (r'id=["\']dbTabs["\']', 'Tab Navigation (dbTabs)'),
        (r'id=["\']dbTabsContent["\']', 'Tab Content (dbTabsContent)'),
        (r'id=["\']backup-tab["\']', 'Backup Tab Button'),
        (r'id=["\']restore-tab["\']', 'Restore Tab Button'),
        (r'id=["\']manage-tab["\']', 'Manage Tab Button'),
        (r'id=["\']deleteBackupModal["\']', 'Delete Backup Modal'),
        (r'class=["\']tab-pane', 'Tab Pane Elements'),
        (r'hx-post=.*create_backup', 'Create Backup Form (functional)'),
        (r'hx-post=.*restore_backup', 'Restore Backup Form (functional)'),
    ]
    
    issues = []
    for pattern, desc in old_patterns:
        if re.search(pattern, content):
            issues.append(desc)
    
    return issues


@override_settings(DEBUG=True)
def main():
    print("=" * 60)
    print("DB Admin Sub-Routes Verification")
    print("=" * 60)
    
    # 创建测试客户端和用户
    client = Client()
    user = get_or_create_test_user()
    client.force_login(user)
    
    # 定义路由
    routes = [
        ('/dashboard/db_admin/', 'Hub (数据库运维入口)'),
        ('/dashboard/db_admin/backup/', '数据备份'),
        ('/dashboard/db_admin/restore/', '数据恢复'),
        ('/dashboard/db_admin/manage/', '备份管理'),
        ('/dashboard/db_admin/clean/', '数据清洗'),
    ]
    
    # 检查路由状态
    print("\n1. Route Status Codes:")
    print("-" * 40)
    all_passed = True
    hub_content = None
    
    for url, name in routes:
        passed = check_route(client, url, name)
        if not passed:
            all_passed = False
        if url == '/dashboard/db_admin/':
            response = client.get(url)
            hub_content = response.content.decode('utf-8')
    
    # 检查 Hub 瘦身
    print("\n2. Hub Cleanup Check:")
    print("-" * 40)
    if hub_content:
        issues = check_hub_cleanup(hub_content)
        if issues:
            print("  [WARN] Hub still contains old elements:")
            for issue in issues:
                print(f"    - {issue}")
            all_passed = False
        else:
            print("  [PASS] Hub has been successfully slimmed down (no old Tab/Content/Modal elements)")
    else:
        print("  [SKIP] Could not retrieve Hub content")
    
    # 检查 Hub 包含入口卡片
    print("\n3. Hub Entry Cards Check:")
    print("-" * 40)
    if hub_content:
        expected_cards = ['数据备份', '数据恢复', '备份管理', '数据清洗']
        found_cards = []
        for card in expected_cards:
            if card in hub_content:
                found_cards.append(card)
        
        if len(found_cards) == len(expected_cards):
            print(f"  [PASS] All {len(expected_cards)} entry cards found")
        else:
            missing = set(expected_cards) - set(found_cards)
            print(f"  [WARN] Missing cards: {missing}")
    
    # 检查子页面包含返回按钮
    print("\n4. Sub-page Back Button Check:")
    print("-" * 40)
    sub_routes = [
        ('/dashboard/db_admin/backup/', '数据备份'),
        ('/dashboard/db_admin/restore/', '数据恢复'),
        ('/dashboard/db_admin/manage/', '备份管理'),
        ('/dashboard/db_admin/clean/', '数据清洗'),
    ]
    
    for url, name in sub_routes:
        response = client.get(url)
        if response.status_code == 200:
            content = response.content.decode('utf-8')
            if '返回数据库运维' in content:
                print(f"  [PASS] {name}: Back button found")
            else:
                print(f"  [WARN] {name}: Back button missing")
        else:
            print(f"  [SKIP] {name}: Could not access page")
    
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
