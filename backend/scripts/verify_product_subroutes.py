#!/usr/bin/env python3
"""
Verify Product Subroutes (Phase: 产品板块改版)
=============================================
验收脚本，检查产品板块子路由化是否完成：
1. Hub 页面 200 且包含各功能卡入口链接（href 正确）
2. 每个子路由页面 200
3. Hub 页面不再包含实际操作区域的关键 DOM
4. Hub 页面使用正确的图标容器样式（.hub-icon-box 而非大色块）
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

from django.test import Client
from django.contrib.auth import get_user_model

User = get_user_model()

# 子路由配置
SUBROUTES = [
    {
        'url': '/dashboard/products/data/',
        'name': '产品数据维护',
        'hub_link_pattern': r'href="[^"]*products/data/[^"]*"',
    },
    {
        'url': '/dashboard/products/add/',
        'name': '新增产品',
        'hub_link_pattern': r'href="[^"]*products/add/[^"]*"',
    },
]

# Hub 页面不应包含的旧操作区 DOM 标识
HUB_FORBIDDEN_PATTERNS = [
    'id="tab-cogs"',
    'id="tab-create"',
    'tab-content-panel',
    'hx-get="{% url',
    'hx-trigger="intersect',
    'id="cogs-content"',
    'id="create-content"',
]

# Hub 页面必须包含的正确样式
HUB_REQUIRED_PATTERNS = [
    '.hub-card',           # 使用 .hub-card 样式
    '.hub-icon-box',       # 使用 .hub-icon-box 图标容器
]

# Hub 页面图标容器不应有的大色块样式（在非子元素层级）
# 正则匹配：div 标签里直接用 bg-success/bg-primary + p-3 的大块
HUB_FORBIDDEN_ICON_PATTERNS = [
    r'<div[^>]*class="[^"]*bg-(success|primary|info|warning|danger)\s+bg-opacity-\d+\s+p-3[^"]*"[^>]*>',
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
    print("Product Subroutes Verification")
    print("=" * 70)
    
    # Setup
    client = Client()
    user = get_or_create_superuser()
    client.force_login(user)
    
    all_passed = True
    
    # 1. Check Hub page
    print("\n1. Hub Page Check (/dashboard/products/):")
    print("-" * 50)
    
    response = client.get('/dashboard/products/')
    status = response.status_code
    print(f"   {'✅' if status == 200 else '❌'} Page Status: {status}")
    
    if status != 200:
        all_passed = False
        print("\n[ABORT] Cannot proceed without hub access")
        return 1
    
    hub_content = response.content.decode('utf-8')
    
    # 1a. Check hub has entry links (2个入口链接)
    print("\n   Entry Links (must have 2):")
    entry_link_count = 0
    for route in SUBROUTES:
        has_link = re.search(route['hub_link_pattern'], hub_content) or route['url'] in hub_content
        print(f"      {'✅' if has_link else '❌'} Link to {route['name']}")
        if has_link:
            entry_link_count += 1
        else:
            all_passed = False
    print(f"      Found {entry_link_count}/2 entry links")
    
    # 1b. Check hub NOT having old operation areas
    print("\n   Hub Slimming (no operation DOM):")
    forbidden_found = []
    for pattern in HUB_FORBIDDEN_PATTERNS:
        if pattern in hub_content:
            forbidden_found.append(pattern)
    
    if forbidden_found:
        all_passed = False
        print(f"      ❌ Still has old DOM: {forbidden_found[:3]}...")
    else:
        print(f"      ✅ No old operation DOM found")
    
    # 1c. Check hub has correct styles
    print("\n   Hub Card Styles:")
    for req_pattern in HUB_REQUIRED_PATTERNS:
        has_style = req_pattern in hub_content
        print(f"      {'✅' if has_style else '❌'} Has {req_pattern}")
        if not has_style:
            all_passed = False
    
    # 1d. Check hub does NOT have large color block icon containers
    print("\n   Icon Container Check (no large color blocks):")
    has_bad_icon = False
    for icon_pattern in HUB_FORBIDDEN_ICON_PATTERNS:
        match = re.search(icon_pattern, hub_content)
        if match:
            has_bad_icon = True
            context = match.group(0)[:80]
            print(f"      ❌ Found large color block: {context}...")
    
    if has_bad_icon:
        all_passed = False
    else:
        print(f"      ✅ No large color block icon containers")
    
    # 2. Check each subroute
    print("\n2. Subroute Pages Check:")
    print("-" * 50)
    
    for route in SUBROUTES:
        response = client.get(route['url'])
        status = response.status_code
        print(f"   {'✅' if status == 200 else '❌'} {route['name']} ({route['url']}): {status}")
        
        if status != 200:
            all_passed = False
            continue
        
        content = response.content.decode('utf-8')
        
        # Check breadcrumb back to hub
        has_breadcrumb = '产品板块' in content and '/dashboard/products/' in content
        print(f"      {'✅' if has_breadcrumb else '⚠️'} Has breadcrumb to hub")
        
        # Check has HTMX load trigger (for actual content loading)
        has_htmx = 'hx-get=' in content or 'hx-trigger=' in content
        print(f"      {'✅' if has_htmx else '⚠️'} Has HTMX content loader")
    
    # Summary
    print("\n" + "=" * 70)
    if all_passed:
        print("🎉 RESULT: ALL SUBROUTE CHECKS PASSED")
        print("\nSubroute Structure:")
        print("  - Hub page: ✅ (cards only, correct styles, no operations)")
        print("  - /products/data/ (产品数据维护): ✅")
        print("  - /products/add/ (新增产品): ✅")
    else:
        print("❌ RESULT: SOME CHECKS FAILED")
    print("=" * 70)
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())
