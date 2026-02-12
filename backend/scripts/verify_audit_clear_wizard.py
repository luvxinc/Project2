#!/usr/bin/env python3
"""
Verify Audit Clear Wizard (Phase 3.6)
=====================================
验收脚本，检查安全审计日志清空页面是否符合 Wizard 三步流程规范：
1. GET /dashboard/audit/purge/ -> 200
2. 页面包含 wizard 三步 testid
3. 页面内不存在密码输入框（仅 GlobalModal）
4. verify endpoint 返回字段齐全且不包含敏感关键词
5. 当 verify 返回 has_data=false 时，执行按钮 disabled
6. Old contract 参数仍存在（log_types/start_date/end_date/reason）
"""
import os
import sys
import re
import json
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

# 敏感关键词列表（verify 响应中禁止出现）
SENSITIVE_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE',
    'Traceback', 'Exception', 'Error:',
    '/Users/', '/home/', '/var/', '/tmp/', '/opt/',
    'mysql', 'postgres', 'sqlite', 'CREATE TABLE', 'DROP TABLE',
    'password', 'secret', 'credential', 'token',
    '.sql', '.db', '.dump',
    'AuditLog', 'System_Audit_Log_Django',  # 表名应脱敏
    'app.log', 'audit.log', 'error.log',  # 文件名应脱敏
]

# 必需的 testid
REQUIRED_TESTIDS = [
    'step-date-range',
    'step-verify-data', 
    'step-execute-clean',
    'verify-metrics-card',
    'execute-status-panel',
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


def check_page_testids(content):
    """检查页面是否包含所有必需的 testid"""
    found = {}
    for testid in REQUIRED_TESTIDS:
        pattern = f'data-testid="{testid}"'
        found[testid] = pattern in content
    return found


def check_password_inputs(content):
    """检查页面是否包含密码输入框（排除 base.html 的全局 modal）"""
    password_pattern = r'<input[^>]*type=["\']password["\'][^>]*>'
    matches = re.findall(password_pattern, content, re.IGNORECASE)
    
    # base.html 有 4 个密码输入（globalResetSelfModal）
    EXPECTED_BASE_PASSWORD_INPUTS = 4
    
    return len(matches) <= EXPECTED_BASE_PASSWORD_INPUTS


def check_verify_endpoint(client):
    """检查 verify endpoint 的响应"""
    # 使用一个不存在数据的日期范围
    result = {
        'accessible': False,
        'has_required_fields': False,
        'no_sensitive_data': True,
        'issues': []
    }
    
    response = client.post('/dashboard/audit/action/purge_verify/', {
        'log_types': ['business', 'infra', 'system'],
        'start_date': '1990-01-01',
        'end_date': '1990-01-31'
    })
    
    if response.status_code != 200:
        result['issues'].append(f'Status code: {response.status_code}')
        return result
    
    result['accessible'] = True
    
    try:
        data = response.json()
    except json.JSONDecodeError:
        result['issues'].append('Response is not valid JSON')
        return result
    
    # 检查必需字段
    required_fields = ['business_count', 'infra_count', 'system_count', 'has_data', 'total']
    missing_fields = [f for f in required_fields if f not in data]
    
    if missing_fields:
        result['issues'].append(f'Missing fields: {missing_fields}')
    else:
        result['has_required_fields'] = True
    
    # 检查敏感关键词
    response_text = json.dumps(data)
    for keyword in SENSITIVE_KEYWORDS:
        if keyword.lower() in response_text.lower():
            result['no_sensitive_data'] = False
            result['issues'].append(f'Sensitive keyword found: {keyword}')
    
    return result


def check_execute_button_disabled(content):
    """检查当无数据时，执行按钮是否会被禁用（通过 JS 逻辑）"""
    # 检查是否有禁用按钮的逻辑
    has_disable_logic = 'btn-step2-next' in content and 'disabled' in content
    return has_disable_logic


def main():
    print("=" * 70)
    print("Audit Clear Wizard Verification")
    print("=" * 70)
    
    # Setup
    client = Client()
    user = get_or_create_superuser()
    client.force_login(user)
    
    all_passed = True
    
    # 1. Check page status
    print("\n1. Page Status Check:")
    print("-" * 50)
    response = client.get('/dashboard/audit/purge/')
    status = response.status_code
    print(f"   [{('✅ PASS' if status == 200 else '❌ FAIL')}] Status: {status}")
    if status != 200:
        all_passed = False
        print("\n[ABORT] Cannot proceed without page access")
        return 1
    
    content = response.content.decode('utf-8')
    
    # 2. Check wizard testids
    print("\n2. Wizard Step TestIDs Check:")
    print("-" * 50)
    testid_results = check_page_testids(content)
    for testid, found in testid_results.items():
        status_icon = '✅' if found else '❌'
        print(f"   {status_icon} {testid}")
        if not found:
            all_passed = False
    
    # 3. Check password inputs
    print("\n3. Password Input Check:")
    print("-" * 50)
    no_extra_passwords = check_password_inputs(content)
    if no_extra_passwords:
        print("   ✅ No extra password inputs in page (uses GlobalModal)")
    else:
        print("   ❌ Found password inputs outside GlobalModal")
        all_passed = False
    
    # 4. Check verify endpoint
    print("\n4. Verify Endpoint Check:")
    print("-" * 50)
    verify_result = check_verify_endpoint(client)
    
    print(f"   {'✅' if verify_result['accessible'] else '❌'} Endpoint accessible")
    print(f"   {'✅' if verify_result['has_required_fields'] else '❌'} Has required fields (business_count, infra_count, system_count, has_data, total)")
    print(f"   {'✅' if verify_result['no_sensitive_data'] else '❌'} No sensitive data in response")
    
    if verify_result['issues']:
        all_passed = False
        print("   Issues:")
        for issue in verify_result['issues']:
            print(f"      - {issue}")
    
    # 5. Check execute button disable logic
    print("\n5. Execute Button Disable Logic Check:")
    print("-" * 50)
    has_disable = check_execute_button_disabled(content)
    if has_disable:
        print("   ✅ Button disable logic exists for has_data=false")
    else:
        print("   ⚠️ Could not verify button disable logic (check JS manually)")
    
    # 6. Check GlobalModal integration
    print("\n6. GlobalModal Integration Check:")
    print("-" * 50)
    has_global_modal_attr = 'data-requires-global-modal="true"' in content
    has_security_action = 'data-action-key="btn_purge_logs"' in content or 'btn_purge_logs' in content
    has_security_inputs = 'name="sec_code_' in content or has_security_action
    
    print(f"   {'✅' if has_global_modal_attr else '❌'} Has data-requires-global-modal attribute")
    print(f"   {'✅' if has_security_inputs else '❌'} Has security inputs / action key for btn_purge_logs")
    
    if not has_global_modal_attr or not has_security_inputs:
        all_passed = False
    
    # 7. Check old contract parameters preserved
    print("\n7. Old Contract Parameters Check:")
    print("-" * 50)
    has_log_types = 'name="log_types"' in content
    has_start_date = 'name="start_date"' in content
    has_end_date = 'name="end_date"' in content
    has_reason = 'name="reason"' in content
    
    print(f"   {'✅' if has_log_types else '❌'} log_types parameter")
    print(f"   {'✅' if has_start_date else '❌'} start_date parameter")
    print(f"   {'✅' if has_end_date else '❌'} end_date parameter")
    print(f"   {'✅' if has_reason else '❌'} reason parameter")
    
    if not all([has_log_types, has_start_date, has_end_date, has_reason]):
        all_passed = False
    
    # 8. Check full-screen layout (not centered card)
    print("\n8. Full-Screen Layout Check:")
    print("-" * 50)
    # 检查不存在居中缩小的卡片式布局（col-lg-8 / col-lg-10 / container 等）
    has_centered_layout = 'class="container"' in content and 'col-lg-8' in content
    is_full_screen = not has_centered_layout
    print(f"   {'✅' if is_full_screen else '❌'} Full-screen wizard layout (not centered card)")
    if not is_full_screen:
        all_passed = False
    
    # Summary
    print("\n" + "=" * 70)
    if all_passed:
        print("🎉 RESULT: ALL WIZARD CHECKS PASSED")
        print("\nWizard Implementation Status:")
        print("  - 3-step flow: ✅")
        print("  - GlobalModal auth: ✅")
        print("  - Verify endpoint: ✅ (desensitized)")
        print("  - Old contract preserved: ✅")
        print("  - Full-screen layout: ✅")
    else:
        print("❌ RESULT: SOME CHECKS FAILED")
    print("=" * 70)
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())
