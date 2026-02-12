#!/usr/bin/env python3
"""
验收脚本：Products Catalog 彻底移除检查

检查项：
1. /dashboard/products/catalog/ -> 404
2. /dashboard/products/catalog/* -> 404
3. templates/js 中不存在 products:catalog 的调用
4. 产品板块页面功能正常（hub/data/add）
5. Hub 页面不包含操作 DOM
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

import subprocess
import re
from django.test import Client
from django.contrib.auth import get_user_model

User = get_user_model()

def get_test_client():
    """创建已登录的测试客户端"""
    user, _ = User.objects.get_or_create(
        username='test_catalog_removal',
        defaults={'is_staff': True, 'is_superuser': True}
    )
    client = Client()
    client.force_login(user)
    return client

def main():
    client = get_test_client()
    all_passed = True
    
    print("=" * 60)
    print("Products Catalog 彻底移除验收")
    print("=" * 60)
    
    # ============================================================
    # Check 1: /dashboard/products/catalog/ -> 404
    # ============================================================
    print("\n[Check 1] GET /dashboard/products/catalog/ -> 404")
    resp = client.get('/dashboard/products/catalog/')
    if resp.status_code == 404:
        print("  ✅ PASS - catalog 根路径返回 404")
    else:
        print(f"  ❌ FAIL - 期望 404, 实际 {resp.status_code}")
        all_passed = False
    
    # ============================================================
    # Check 2: /dashboard/products/catalog/* -> 404
    # ============================================================
    print("\n[Check 2] GET /dashboard/products/catalog/data_change/cogs/load/ -> 404")
    resp = client.get('/dashboard/products/catalog/data_change/cogs/load/')
    if resp.status_code == 404:
        print("  ✅ PASS - catalog 子路由返回 404")
    else:
        print(f"  ❌ FAIL - 期望 404, 实际 {resp.status_code}")
        all_passed = False
    
    # ============================================================
    # Check 3: templates 中不存在 products:catalog 的调用
    # ============================================================
    print("\n[Check 3] templates 中不存在 products:catalog 调用")
    templates_dir = backend_dir / 'templates'
    result = subprocess.run(
        ['grep', '-r', 'products:catalog', str(templates_dir)],
        capture_output=True, text=True
    )
    if result.returncode != 0 and not result.stdout.strip():
        print("  ✅ PASS - 无 products:catalog 引用")
    else:
        print(f"  ❌ FAIL - 发现 products:catalog 引用:")
        for line in result.stdout.strip().split('\n')[:5]:
            print(f"    {line}")
        all_passed = False
    
    # ============================================================
    # Check 4: catalog_urls.py 已删除
    # ============================================================
    print("\n[Check 4] catalog_urls.py 已删除")
    catalog_urls_path = backend_dir / 'apps' / 'products' / 'catalog_urls.py'
    if not catalog_urls_path.exists():
        print("  ✅ PASS - catalog_urls.py 已删除")
    else:
        print("  ❌ FAIL - catalog_urls.py 仍存在")
        all_passed = False
    
    # ============================================================
    # Check 5: Products Hub 可访问
    # ============================================================
    print("\n[Check 5] GET /dashboard/products/ -> 200")
    resp = client.get('/dashboard/products/')
    if resp.status_code == 200:
        print("  ✅ PASS - Products Hub 返回 200")
    else:
        print(f"  ❌ FAIL - 期望 200, 实际 {resp.status_code}")
        all_passed = False
    
    # ============================================================
    # Check 6: Products Data 可访问
    # ============================================================
    print("\n[Check 6] GET /dashboard/products/data/ -> 200")
    resp = client.get('/dashboard/products/data/')
    if resp.status_code == 200:
        print("  ✅ PASS - Products Data 返回 200")
    else:
        print(f"  ❌ FAIL - 期望 200, 实际 {resp.status_code}")
        all_passed = False
    
    # ============================================================
    # Check 7: Products Add 可访问
    # ============================================================
    print("\n[Check 7] GET /dashboard/products/add/ -> 200")
    resp = client.get('/dashboard/products/add/')
    if resp.status_code == 200:
        print("  ✅ PASS - Products Add 返回 200")
    else:
        print(f"  ❌ FAIL - 期望 200, 实际 {resp.status_code}")
        all_passed = False
    
    # ============================================================
    # Check 8: Hub 模板源文件不包含操作 DOM
    # ============================================================
    print("\n[Check 8] Hub 模板源文件不包含操作 DOM (hx-get/hx-post)")
    hub_template = backend_dir / 'templates' / 'products' / 'hub.html'
    hub_content = hub_template.read_text(encoding='utf-8')
    
    # 检查 Hub 模板本身是否包含 HTMX 操作区
    forbidden_patterns = [
        ('hx-get=', 'HTMX GET 操作'),
        ('hx-post=', 'HTMX POST 操作'),
    ]
    
    found_issues = []
    for pattern, desc in forbidden_patterns:
        if pattern in hub_content:
            found_issues.append(desc)
    
    if not found_issues:
        print("  ✅ PASS - Hub 模板为纯入口页，无操作 DOM")
    else:
        print(f"  ❌ FAIL - Hub 模板包含操作 DOM: {found_issues}")
        all_passed = False
    
    # ============================================================
    # Check 9: HTMX 接口可通过 db_admin 访问
    # ============================================================
    print("\n[Check 9] HTMX 接口通过 db_admin 可访问")
    resp = client.get('/dashboard/db_admin/data_change/cogs/load/')
    if resp.status_code == 200:
        print("  ✅ PASS - db_admin:cogs_load_table 返回 200")
    else:
        print(f"  ❌ FAIL - 期望 200, 实际 {resp.status_code}")
        all_passed = False
    
    resp = client.get('/dashboard/db_admin/data_change/cogs/form/')
    if resp.status_code == 200:
        print("  ✅ PASS - db_admin:cogs_get_form 返回 200")
    else:
        print(f"  ❌ FAIL - 期望 200, 实际 {resp.status_code}")
        all_passed = False
    
    # ============================================================
    # 最终结果
    # ============================================================
    print("\n" + "=" * 60)
    if all_passed:
        print("🎉 所有检查项 PASS - Catalog 彻底移除成功")
        print("=" * 60)
        return 0
    else:
        print("❌ 存在失败项，请检查上述输出")
        print("=" * 60)
        return 1

if __name__ == '__main__':
    sys.exit(main())
