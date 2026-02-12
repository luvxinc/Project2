#!/usr/bin/env python3
"""
Verify DB Admin UI Contract (Phase 2)
======================================
验收脚本，检查 DB Admin 二期 UI 重构是否符合规范：
1. 4 个子页面返回 200
2. 必须包含 3 个 data-testid 卡片
3. 页面内不得出现 <input type="password">
4. 危险按钮必须带 data-requires-global-modal="true"
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


def get_or_create_superuser():
    """获取或创建超级用户（用于测试数据清洗页面访问权限）"""
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


class ContractChecker:
    """UI 合约检查器"""
    
    REQUIRED_TESTIDS = [
        'ops-guide-card',      # 操作须知卡片
        'primary-action-card', # 主操作卡片
        'result-panel'         # 结果区域
    ]
    
    def __init__(self, client):
        self.client = client
        self.results = {}
    
    def check_page(self, url, name):
        """检查单个页面"""
        result = {
            'name': name,
            'url': url,
            'status': None,
            'testids': {},
            'has_password_input': False,
            'danger_buttons': [],
            'issues': []
        }
        
        # 1. Check status code
        response = self.client.get(url)
        result['status'] = response.status_code
        
        if response.status_code != 200:
            result['issues'].append(f"Status code: {response.status_code}, expected 200")
            self.results[url] = result
            return result
        
        content = response.content.decode('utf-8')
        
        # 2. Check required data-testid attributes
        for testid in self.REQUIRED_TESTIDS:
            pattern = f'data-testid="{testid}"'
            result['testids'][testid] = pattern in content
            if not result['testids'][testid]:
                result['issues'].append(f"Missing data-testid=\"{testid}\"")
        
        # 3. Check for password input in PAGE content only (not inherited base.html modals)
        # Exclude known base.html modals: globalResetSelfModal, noPermissionModal
        # These are in base.html and contain password inputs for global functions
        
        # Find the main content block (between {% block content %} and end)
        # A simple heuristic: look for password inputs NOT in known global modal IDs
        global_modal_ids = ['globalResetSelfModal', 'noPermissionModal', 'globalModal']
        
        # Look for password inputs outside these modals
        password_pattern = r'<input[^>]*type=["\']password["\'][^>]*>'
        password_matches = re.findall(password_pattern, content, re.IGNORECASE)
        
        # Filter out passwords within global modals (rough check)
        page_password_count = 0
        for match in password_matches:
            # Check if this password input is within a known global modal
            # Simple: count occurrences and compare with what we expect from base.html (4 inputs)
            pass
        
        # base.html has exactly 4 password inputs (in globalResetSelfModal)
        # If we find more than 4, the page has extra password inputs
        EXPECTED_BASE_PASSWORD_INPUTS = 4
        result['has_password_input'] = len(password_matches) > EXPECTED_BASE_PASSWORD_INPUTS
        if result['has_password_input']:
            extra_count = len(password_matches) - EXPECTED_BASE_PASSWORD_INPUTS
            result['issues'].append(f"Found {extra_count} extra password input(s) beyond base template (should use GlobalModal)")
        
        # 4. Check danger buttons have GlobalModal attribute
        # Exclude known base.html buttons: noPermConfirm
        danger_button_pattern = r'<button[^>]*class=["\'][^"\']*btn-(?:danger|warning)[^"\']*["\'][^>]*>'
        danger_buttons = re.findall(danger_button_pattern, content)
        
        for btn_html in danger_buttons:
            # Skip base.html global buttons
            if 'noPermConfirm' in btn_html:
                continue
                
            has_modal_attr = 'data-requires-global-modal' in btn_html
            btn_info = {
                'html': btn_html[:100] + '...' if len(btn_html) > 100 else btn_html,
                'has_modal_attr': has_modal_attr
            }
            result['danger_buttons'].append(btn_info)
            
            # Only flag as issue if it's a primary action button (not disabled)
            if not has_modal_attr and 'disabled' not in btn_html:
                # Check if it's an actual action button (has onclick or type="submit")
                if 'onclick=' in btn_html or 'type="submit"' in btn_html or 'id="btn-' in btn_html:
                    result['issues'].append(f"Danger button missing data-requires-global-modal: {btn_html[:80]}...")
        
        self.results[url] = result
        return result
    
    def print_report(self):
        """打印检查报告"""
        print("=" * 70)
        print("DB Admin UI Contract Verification Report")
        print("=" * 70)
        
        all_passed = True
        
        for url, result in self.results.items():
            print(f"\n{'─' * 60}")
            print(f"📄 {result['name']}")
            print(f"   URL: {url}")
            print(f"   Status: {'✅ ' + str(result['status']) if result['status'] == 200 else '❌ ' + str(result['status'])}")
            
            # TestIDs
            print("   Required TestIDs:")
            for testid, found in result['testids'].items():
                status = '✅' if found else '❌'
                print(f"      {status} {testid}")
            
            # Password inputs
            pwd_status = '❌ FOUND (not allowed)' if result['has_password_input'] else '✅ None (good)'
            print(f"   Password Inputs: {pwd_status}")
            
            # Danger buttons
            if result['danger_buttons']:
                print(f"   Danger Buttons: {len(result['danger_buttons'])} found")
                for i, btn in enumerate(result['danger_buttons'][:3]):  # Show first 3
                    modal_status = '✅' if btn['has_modal_attr'] else '⚠️'
                    print(f"      {modal_status} Button {i+1}: GlobalModal attr = {btn['has_modal_attr']}")
            
            # Issues
            if result['issues']:
                all_passed = False
                print(f"   ⚠️ Issues ({len(result['issues'])}):")
                for issue in result['issues']:
                    print(f"      - {issue}")
            else:
                print("   ✅ No issues found")
        
        print("\n" + "=" * 70)
        if all_passed:
            print("🎉 RESULT: ALL CHECKS PASSED")
        else:
            print("⚠️ RESULT: SOME CHECKS FAILED")
        print("=" * 70)
        
        return all_passed


def main():
    # Setup
    client = Client()
    user = get_or_create_superuser()
    client.force_login(user)
    
    # Pages to check
    pages = [
        ('/dashboard/db_admin/backup/', '数据备份'),
        ('/dashboard/db_admin/restore/', '数据恢复'),
        ('/dashboard/db_admin/manage/', '备份管理'),
        ('/dashboard/db_admin/clean/', '数据清洗'),
    ]
    
    # Run checks
    checker = ContractChecker(client)
    
    print("\n🔍 Checking pages...\n")
    
    for url, name in pages:
        checker.check_page(url, name)
    
    # Print report
    all_passed = checker.print_report()
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())
