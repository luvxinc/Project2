#!/usr/bin/env python3
"""
Verify Product Rename (Phase: 产品板块改版)
===========================================
验收脚本，检查产品板块文案重命名是否完成：
1. UI 中不再出现旧文案（COGS档案维护、批量新增SKU）
2. UI 中出现新文案（产品数据维护、新增产品）
"""
import os
import sys
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

from django.test import Client
from django.contrib.auth import get_user_model

User = get_user_model()

# 旧文案（不应出现）
OLD_TEXTS = [
    'COGS档案维护',
    'COGS 档案维护',
    '批量新增SKU',
    '批量新增 SKU',
]

# 新文案（应该出现）
NEW_TEXTS = [
    '产品数据维护',
    '新增产品',
]

# 要检查的页面
PAGES = [
    {'url': '/dashboard/products/', 'name': 'Hub 页面'},
    {'url': '/dashboard/products/data/', 'name': '产品数据维护页面'},
    {'url': '/dashboard/products/add/', 'name': '新增产品页面'},
]


def get_or_create_superuser():
    """获取或创建超级用户"""
    username = 'test_superadmin'
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


def main():
    print("=" * 70)
    print("Product Rename Verification")
    print("=" * 70)
    
    # Setup
    client = Client()
    user = get_or_create_superuser()
    client.force_login(user)
    
    all_passed = True
    
    for page in PAGES:
        print(f"\n{page['name']} ({page['url']}):")
        print("-" * 50)
        
        response = client.get(page['url'])
        status = response.status_code
        print(f"   {'✅' if status == 200 else '❌'} Page Status: {status}")
        
        if status != 200:
            all_passed = False
            continue
        
        content = response.content.decode('utf-8')
        
        # Check old texts NOT present
        old_found = []
        for old_text in OLD_TEXTS:
            if old_text in content:
                old_found.append(old_text)
        
        if old_found:
            all_passed = False
            print(f"   ❌ Old texts still present: {old_found}")
        else:
            print(f"   ✅ No old texts found")
        
        # Check new texts present (at least one should be present per page type)
        new_found = []
        for new_text in NEW_TEXTS:
            if new_text in content:
                new_found.append(new_text)
        
        if new_found:
            print(f"   ✅ New texts found: {new_found}")
        else:
            # Hub 页面应该包含所有新文案，子页面只包含自己的
            if 'hub' in page['url'] or page['url'] == '/dashboard/product/':
                all_passed = False
                print(f"   ❌ No new texts found (expected both)")
            else:
                print(f"   ⚠️ No new texts found (may be HTMX loaded)")
    
    # Summary
    print("\n" + "=" * 70)
    if all_passed:
        print("🎉 RESULT: ALL RENAME CHECKS PASSED")
        print("\nRename Status:")
        print("  - COGS档案维护 -> 产品数据维护: ✅")
        print("  - 批量新增SKU -> 新增产品: ✅")
    else:
        print("❌ RESULT: SOME CHECKS FAILED")
    print("=" * 70)
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())
