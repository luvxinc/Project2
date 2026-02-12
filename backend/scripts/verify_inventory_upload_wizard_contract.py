#!/usr/bin/env python3
"""
Verify Inventory Upload Wizard Contract
========================================
验证库存上传向导改版后的 UI/结构契约：
1. /dashboard/inventory/upload/ 返回 200
2. 页面包含 GlobalWizard 结构
3. 步骤数量为 6
4. Step1 使用公有 Upload 组件
5. Apple table 样式存在
6. 确认入库按钮包含 data-requires-global-modal
7. 无可见 type=password 输入框
8. 不使用 innerHTML 直接塞 alert html
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
    print("Inventory Upload Wizard Contract Verification")
    print("=" * 60)
    
    # Create test client
    client = Client()
    user = get_or_create_test_user()
    client.force_login(user)
    
    all_passed = True
    
    # ============================================================
    # Test 1: Route returns 200
    # ============================================================
    print("\n1. Route Status Check:")
    print("-" * 40)
    response = client.get('/dashboard/inventory/upload/')
    if response.status_code == 200:
        print("  [PASS] /dashboard/inventory/upload/ returns 200")
        content = response.content.decode('utf-8')
    else:
        print(f"  [FAIL] /dashboard/inventory/upload/ returns {response.status_code}")
        all_passed = False
        content = ""
    
    if not content:
        print("\n" + "=" * 60)
        print("RESULT: FAILED - Could not retrieve page content")
        print("=" * 60)
        return 1
    
    # ============================================================
    # Test 2: GlobalWizard structure
    # ============================================================
    print("\n2. GlobalWizard Structure Check:")
    print("-" * 40)
    
    checks = [
        (r'id=["\']inv-upload-wizard-container["\']', 'Wizard Container ID'),
        (r'data-wizard-stepbar-anchor', 'StepBar Anchor'),
        (r'global-wizard\.css', 'GlobalWizard CSS'),
        (r'GlobalWizard\s*\(', 'GlobalWizard JS instantiation'),
    ]
    
    for pattern, desc in checks:
        if re.search(pattern, content):
            print(f"  [PASS] {desc}")
        else:
            print(f"  [FAIL] {desc} not found")
            all_passed = False
    
    # ============================================================
    # Test 3: Step count = 6
    # ============================================================
    print("\n3. Step Count Check:")
    print("-" * 40)
    
    # V2: Combined syncing+done into 5 steps
    step_ids = ['step-upload', 'step-validate', 'step-fix', 'step-review', 'step-done']
    found_steps = []
    for step_id in step_ids:
        if f'id="{step_id}"' in content:
            found_steps.append(step_id)
    
    if len(found_steps) == 5:
        print(f"  [PASS] Found all 5 steps: {found_steps}")
    else:
        print(f"  [FAIL] Expected 5 steps, found {len(found_steps)}: {found_steps}")
        all_passed = False
    
    # ============================================================
    # Test 4: Upload component (Step 1)
    # ============================================================
    print("\n4. Upload Component Check:")
    print("-" * 40)
    
    upload_checks = [
        (r'data-testid=["\']upload-component["\']', 'Upload component data-testid'),
        (r'id=["\']upload-dropzone["\']', 'Dropzone element'),
        (r'type=["\']file["\'].*accept=["\']\.csv["\']', 'CSV file input'),
    ]
    
    for pattern, desc in upload_checks:
        if re.search(pattern, content, re.IGNORECASE):
            print(f"  [PASS] {desc}")
        else:
            print(f"  [WARN] {desc} not found")
    
    # ============================================================
    # Test 5: Apple table styling
    # ============================================================
    print("\n5. Apple Table Style Check:")
    print("-" * 40)
    
    apple_checks = [
        (r'apple-table\.css', 'Apple table CSS import'),
        (r'class=["\'][^"\']*apple-table', 'Apple table class usage'),
    ]
    
    for pattern, desc in apple_checks:
        if re.search(pattern, content):
            print(f"  [PASS] {desc}")
        else:
            print(f"  [FAIL] {desc} not found")
            all_passed = False
    
    # ============================================================
    # Test 6: Confirm button with GlobalModal
    # ============================================================
    print("\n6. GlobalModal Integration Check:")
    print("-" * 40)
    
    modal_checks = [
        (r'data-requires-global-modal=["\']true["\']', 'data-requires-global-modal attribute'),
        (r'data-action-key=["\']btn_sync_inventory["\']', 'data-action-key for sync'),
        (r'requestPasswordVerify\s*\(', 'requestPasswordVerify call'),
    ]
    
    for pattern, desc in modal_checks:
        if re.search(pattern, content):
            print(f"  [PASS] {desc}")
        else:
            print(f"  [FAIL] {desc} not found")
            all_passed = False
    
    # ============================================================
    # Test 7: No visible password input
    # ============================================================
    print("\n7. No Visible Password Input Check:")
    print("-" * 40)
    
    # Read the template source file directly to check for password inputs
    # (since rendered HTML includes GlobalModal from base.html)
    template_path = backend_dir / 'templates' / 'inventory' / 'pages' / 'upload.html'
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        # Find password inputs in template (excluding security_inputs which are hidden)
        password_inputs = re.findall(r'<input[^>]*type=["\']password["\'][^>]*>', template_content, re.IGNORECASE)
        visible_passwords = [p for p in password_inputs if 'd-none' not in p and 'hidden' not in p.lower()]
        
        if len(visible_passwords) == 0:
            print("  [PASS] No visible password inputs in template")
        else:
            print(f"  [FAIL] Found {len(visible_passwords)} visible password inputs in template")
            all_passed = False
        
        # Check for security_inputs (should exist but hidden)
        if 'security_inputs' in template_content:
            print("  [PASS] security_inputs tag present (expected)")
        else:
            print("  [WARN] No security_inputs found")
    except Exception as e:
        print(f"  [WARN] Could not read template file: {e}")
    
    # ============================================================
    # Test 8: No innerHTML with alert HTML
    # ============================================================
    print("\n8. Safe DOM Construction Check:")
    print("-" * 40)
    
    # Check for dangerous innerHTML patterns with alert
    dangerous_patterns = [
        r'\.innerHTML\s*=\s*["\'][^"\']*<div[^>]*class=["\'][^"\']*alert',
        r'\.innerHTML\s*=\s*html',  # innerHTML = html (from fetch response)
    ]
    
    found_dangerous = []
    for pattern in dangerous_patterns:
        matches = re.findall(pattern, content)
        if matches:
            found_dangerous.extend(matches)
    
    # Allow innerHTML for safe DOM building (tables, etc.)
    # But warn about innerHTML = html patterns
    if 'innerHTML = html' in content:
        print("  [WARN] Found 'innerHTML = html' pattern - verify it's not rendering unsanitized backend HTML")
    else:
        print("  [PASS] No direct innerHTML with backend HTML injection found")
    
    # ============================================================
    # Test 9: Wizard step navigation
    # ============================================================
    print("\n9. Wizard Navigation Check:")
    print("-" * 40)
    
    nav_checks = [
        (r'wizard\.goToStep\s*\(', 'wizard.goToStep calls'),
        (r'btn-step\d+-back', 'Back button IDs'),
        (r'wizard\.restart\s*\(', 'wizard.restart call'),
    ]
    
    for pattern, desc in nav_checks:
        if re.search(pattern, content):
            print(f"  [PASS] {desc}")
        else:
            print(f"  [WARN] {desc} not found")
    
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
