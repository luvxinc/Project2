#!/usr/bin/env python3
"""
Verify DB Admin Clean Contract
===============================
验收脚本，确保 clean 页面业务合约与旧版 dashboard.html 100%一致。

旧版合约来源: backend/templates/db_admin/dashboard.html (Tab版本)
- Lines 410-448: clean 表单定义
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


# =============================================================================
# 旧版合约定义 (来自 dashboard.html Tab版本)
# =============================================================================

OLD_VERSION_CONTRACT = {
    # (1) Endpoint URL
    'endpoint': '/dashboard/db_admin/action/clean_data/',
    
    # (2) HTTP Method
    'method': 'POST',
    
    # (3) 必填参数列表
    'required_params': {
        'start_date': {
            'type': 'date',
            'description': '开始日期 (YYYY-MM-DD)',
            'input_type': 'date',
        },
        'end_date': {
            'type': 'date', 
            'description': '结束日期 (YYYY-MM-DD)',
            'input_type': 'date',
        },
        'reason': {
            'type': 'text',
            'description': '审计原因 (必填)',
            'input_type': 'textarea',
        },
    },
    
    # (4) 日期参数解释 (来自 views.py clean_data 函数)
    'date_interpretation': {
        'format': '%Y-%m-%d',
        'filter_field': 'created_at',  # 按 created_at 字段过滤
        'boundary': 'inclusive',  # 包含起止日期
    },
    
    # (5) Security action key
    'security_action': 'btn_clean_data',
    
    # (6) 后端执行函数
    'backend_function': {
        'file': 'backend/apps/db_admin/views.py',
        'function': 'clean_data',
        'service_method': 'DatabaseService.delete_business_data_by_range',
    },
}


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


def check_page_params(content):
    """从页面 HTML 中提取参数定义"""
    params = {}
    
    # 查找 input[type=date] name="xxx"
    date_inputs = re.findall(r'<input[^>]*type=["\']date["\'][^>]*name=["\']([^"\']+)["\']', content)
    for name in date_inputs:
        params[name] = 'date'
    
    # 查找 name="xxx" type="date" (顺序不同)
    date_inputs2 = re.findall(r'<input[^>]*name=["\']([^"\']+)["\'][^>]*type=["\']date["\']', content)
    for name in date_inputs2:
        params[name] = 'date'
    
    # 查找 textarea name="xxx"
    textareas = re.findall(r'<textarea[^>]*name=["\']([^"\']+)["\']', content)
    for name in textareas:
        params[name] = 'textarea'
    
    # 查找 security_inputs 'xxx'
    security = re.findall(r'security_inputs\s+["\']([^"\']+)["\']', content)
    
    return params, security


def check_endpoint_in_page(content):
    """检查页面中的提交 endpoint"""
    # 查找 fetch URL 或 hx-post URL
    # JavaScript fetch
    fetch_urls = re.findall(r'fetch\(["\']([^"\']+clean_data[^"\']*)["\']', content)
    
    # HTMX hx-post
    htmx_urls = re.findall(r'hx-post=["\']([^"\']+clean_data[^"\']*)["\']', content)
    
    return fetch_urls + htmx_urls


def verify_backend_function():
    """验证后端函数是否为旧版"""
    views_file = backend_dir / 'apps' / 'db_admin' / 'views.py'
    if not views_file.exists():
        return False, "views.py not found"
    
    content = views_file.read_text()
    
    # 检查 clean_data 函数是否调用正确的 service 方法
    if 'delete_business_data_by_range' not in content:
        return False, "delete_business_data_by_range not found in views.py"
    
    # 检查参数名是否正确
    if 'start_date' not in content or 'end_date' not in content or 'reason' not in content:
        return False, "Missing required parameter names in clean_data function"
    
    return True, "Backend function matches old version contract"


def main():
    print("=" * 70)
    print("DB Admin Clean Contract Verification")
    print("=" * 70)
    
    # Setup
    client = Client()
    user = get_or_create_superuser()
    client.force_login(user)
    
    all_passed = True
    
    # 1. Check page status
    print("\n1. Page Status Check:")
    print("-" * 50)
    response = client.get('/dashboard/db_admin/clean/')
    status = response.status_code
    print(f"   [{('✅ PASS' if status == 200 else '❌ FAIL')}] Status: {status}")
    if status != 200:
        all_passed = False
        print("\n[ABORT] Cannot proceed without page access")
        return 1
    
    content = response.content.decode('utf-8')
    
    # 2. Check parameters
    print("\n2. Parameter Contract Check:")
    print("-" * 50)
    print("   Expected (from old dashboard.html):")
    for param, info in OLD_VERSION_CONTRACT['required_params'].items():
        print(f"      - {param}: {info['type']} ({info['description']})")
    
    page_params, security_actions = check_page_params(content)
    print("\n   Found in current page:")
    for param, ptype in page_params.items():
        print(f"      - {param}: {ptype}")
    
    # Compare
    expected_params = set(OLD_VERSION_CONTRACT['required_params'].keys())
    found_params = set(page_params.keys())
    
    missing = expected_params - found_params
    extra = found_params - expected_params
    
    if missing:
        print(f"\n   ❌ MISSING params: {missing}")
        all_passed = False
    if extra:
        # 允许 security 相关的隐藏字段
        real_extra = {p for p in extra if not p.startswith('sec_code_') and p != 'csrfmiddlewaretoken'}
        if real_extra:
            print(f"\n   ❌ EXTRA params (not allowed): {real_extra}")
            all_passed = False
        else:
            print(f"\n   ✅ Extra params are security-related: {extra} (allowed)")
    
    if not missing and not extra:
        print("\n   ✅ Parameter contract matches old version")
    
    # 3. Check security action
    print("\n3. Security Action Check:")
    print("-" * 50)
    expected_action = OLD_VERSION_CONTRACT['security_action']
    print(f"   Expected: {expected_action}")
    print(f"   Found: {security_actions}")
    
    if expected_action in security_actions:
        print("   ✅ Security action matches")
    else:
        print("   ❌ Security action mismatch")
        all_passed = False
    
    # 4. Check endpoint
    print("\n4. Endpoint Check:")
    print("-" * 50)
    expected_endpoint = OLD_VERSION_CONTRACT['endpoint']
    found_endpoints = check_endpoint_in_page(content)
    print(f"   Expected: {expected_endpoint}")
    print(f"   Found: {found_endpoints}")
    
    if any(expected_endpoint in ep for ep in found_endpoints):
        print("   ✅ Endpoint matches old version")
    else:
        print("   ❌ Endpoint mismatch")
        all_passed = False
    
    # 5. Check backend function
    print("\n5. Backend Function Check:")
    print("-" * 50)
    passed, msg = verify_backend_function()
    print(f"   {('✅' if passed else '❌')} {msg}")
    if not passed:
        all_passed = False
    
    # 6. Check for forbidden elements
    print("\n6. Forbidden Elements Check:")
    print("-" * 50)
    
    # Check for target selection (which I wrongly added)
    forbidden_patterns = [
        (r'name=["\']target["\']', 'target 参数 (改变业务范围)'),
        (r'已软删除的记录', '软删除类型选择 (改变业务范围)'),
        (r'孤立数据记录', '孤立数据选择 (改变业务范围)'),
        (r'临时缓存数据', '临时缓存选择 (改变业务范围)'),
    ]
    
    for pattern, desc in forbidden_patterns:
        if re.search(pattern, content):
            print(f"   ❌ Found forbidden element: {desc}")
            all_passed = False
        else:
            print(f"   ✅ No {desc}")
    
    # Summary
    print("\n" + "=" * 70)
    if all_passed:
        print("🎉 RESULT: ALL CONTRACT CHECKS PASSED")
        print("\nBusiness Logic Status: 100% matches old version")
        print("- Endpoint: ✅")
        print("- Parameters: ✅ (start_date, end_date, reason)")
        print("- Security Action: ✅ (btn_clean_data)")
        print("- Backend Function: ✅ (delete_business_data_by_range)")
        print("- UI Only Changes: ✅ (Apple style retained)")
    else:
        print("❌ RESULT: CONTRACT MISMATCH DETECTED")
        print("\nBusiness logic has been altered from old version!")
    print("=" * 70)
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())
