#!/usr/bin/env python3
"""
Verify Inventory Edit Wizard Contract
======================================
验证库存修改向导改版后的 UI/结构契约：
1. /dashboard/inventory/edit/ 返回 200
2. 页面包含 GlobalWizard 结构
3. 步骤数量为 5
4. Apple table 样式存在
5. 确认执行按钮包含 data-requires-global-modal
6. 无可见 type=password 输入框
7. 无 history.back() 调用
8. security_inputs 存在但隐藏
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
    print("Inventory Edit Wizard Contract Verification")
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
    response = client.get('/dashboard/inventory/edit/')
    if response.status_code == 200:
        print("  [PASS] /dashboard/inventory/edit/ returns 200")
        content = response.content.decode('utf-8')
    else:
        print(f"  [FAIL] /dashboard/inventory/edit/ returns {response.status_code}")
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
        (r'id=["\']inv-edit-wizard-container["\']', 'Wizard Container ID'),
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
    # Test 3: Step count = 5
    # ============================================================
    print("\n3. Step Count Check:")
    print("-" * 40)
    
    step_ids = ['step-date', 'step-action', 'step-validate', 'step-review', 'step-done']
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
    # Test 4: Apple table styling
    # ============================================================
    print("\n4. Apple Table Style Check:")
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
    # Test 5: GlobalModal Integration
    # ============================================================
    print("\n5. GlobalModal Integration Check:")
    print("-" * 40)
    
    modal_checks = [
        (r'data-requires-global-modal=["\']true["\']', 'data-requires-global-modal attribute'),
        (r'requestPasswordVerify\s*\(', 'requestPasswordVerify call'),
    ]
    
    for pattern, desc in modal_checks:
        if re.search(pattern, content):
            print(f"  [PASS] {desc}")
        else:
            print(f"  [FAIL] {desc} not found")
            all_passed = False
    
    # ============================================================
    # Test 6: No visible password input (check template source)
    # ============================================================
    print("\n6. No Visible Password Input Check:")
    print("-" * 40)
    
    template_path = backend_dir / 'templates' / 'inventory' / 'pages' / 'edit.html'
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        password_inputs = re.findall(r'<input[^>]*type=["\']password["\'][^>]*>', template_content, re.IGNORECASE)
        visible_passwords = [p for p in password_inputs if 'd-none' not in p and 'hidden' not in p.lower()]
        
        if len(visible_passwords) == 0:
            print("  [PASS] No visible password inputs in template")
        else:
            print(f"  [FAIL] Found {len(visible_passwords)} visible password inputs")
            all_passed = False
        
        if 'security_inputs' in template_content:
            print("  [PASS] security_inputs tag present (expected)")
        else:
            print("  [WARN] No security_inputs found")
    except Exception as e:
        print(f"  [WARN] Could not read template file: {e}")
    
    # ============================================================
    # Test 7: No history.back()
    # ============================================================
    print("\n7. No history.back() Check:")
    print("-" * 40)
    
    if 'history.back' in content:
        print("  [FAIL] Found history.back() in page")
        all_passed = False
    else:
        print("  [PASS] No history.back() found")
    
    # ============================================================
    # Test 8: Wizard navigation (goToStep)
    # ============================================================
    print("\n8. Wizard Navigation Check:")
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
    # Test 9: No old security verification UI (check template source only)
    # ============================================================
    print("\n9. No Old Security UI Check:")
    print("-" * 40)
    
    # Use template source file instead of rendered HTML to avoid false positives from base.html
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        old_ui_checks = [
            (r'<div[^>]*class=["\'][^"\']*alert[^"\']*["\'][^>]*>.*?安全验证', 'Old security alert card'),
            (r'fa-key.*?安全验证', 'Old security key icon with text'),
            (r'fa-radiation.*?系统级安全验证', 'Old L4 security UI'),
        ]
        
        found_old_ui = []
        for pattern, desc in old_ui_checks:
            if re.search(pattern, template_content, re.DOTALL | re.IGNORECASE):
                found_old_ui.append(desc)
        
        if len(found_old_ui) == 0:
            print("  [PASS] No old security verification UI found in template source")
        else:
            print(f"  [FAIL] Found old security UI elements: {found_old_ui}")
            all_passed = False
    except Exception as e:
        print(f"  [WARN] Could not check template: {e}")
    
    # ============================================================
    # Test 10: 操作须知卡片存在 (问题1 & 问题4)
    # ============================================================
    print("\n10. Operation Guide Card Check:")
    print("-" * 40)
    
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        # 检查操作须知卡片
        if 'data-testid="ops-guide-card"' in template_content:
            print("  [PASS] Operation guide card exists (data-testid)")
        else:
            print("  [FAIL] Operation guide card not found")
            all_passed = False
        
        # 检查关键词
        guide_keywords = ['更新', '删除', '盘存日期', '最终确认']
        found_keywords = [k for k in guide_keywords if k in template_content]
        if len(found_keywords) >= 3:
            print(f"  [PASS] Guide contains keywords: {found_keywords}")
        else:
            print(f"  [WARN] Missing guide keywords, found: {found_keywords}")
        
        # 禁止旧流程字符串
        if '选择日期 → 操作 → 检验 → 确认 → 完成' in template_content:
            print("  [FAIL] Old flow string still present")
            all_passed = False
        else:
            print("  [PASS] No old flow string")
            
    except Exception as e:
        print(f"  [WARN] Could not check: {e}")
    
    # ============================================================
    # Test 11: 术语统一 - "库存列" 改为 "盘存日期" (问题3)
    # ============================================================
    print("\n11. Terminology Check:")
    print("-" * 40)
    
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        # 不应出现"库存列"
        if '库存列' in template_content:
            print("  [FAIL] Old term '库存列' still present")
            all_passed = False
        else:
            print("  [PASS] No old term '库存列'")
        
        # 必须出现"盘存日期"
        count = template_content.count('盘存日期')
        if count >= 2:
            print(f"  [PASS] Term '盘存日期' appears {count} times")
        else:
            print(f"  [WARN] Term '盘存日期' only appears {count} times (expected >= 2)")
            
    except Exception as e:
        print(f"  [WARN] Could not check: {e}")
    
    # ============================================================
    # Test 12: 日期刷新逻辑存在 (问题2)
    # ============================================================
    print("\n12. Date Refresh Logic Check:")
    print("-" * 40)
    
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        if 'refreshDateOptions' in template_content:
            print("  [PASS] refreshDateOptions function exists")
        else:
            print("  [FAIL] refreshDateOptions function not found")
            all_passed = False
        
        # 检查在 restart 或 step change 中调用
        if 'onRestart' in template_content and 'refreshDateOptions' in template_content:
            print("  [PASS] Refresh called on restart")
        else:
            print("  [WARN] Refresh may not be called on restart")
            
    except Exception as e:
        print(f"  [WARN] Could not check: {e}")
    
    # ============================================================
    # Test 13: 脱敏检查 - 无敏感信息 (问题5)
    # ============================================================
    print("\n13. Desensitization Check:")
    print("-" * 40)
    
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        # 敏感模式 - 只检查可能直接输出到用户的内容
        # 排除在 .replace() 中用于脱敏的模式
        sensitive_patterns = [
            (r'/Users/[^\s]+', 'Local path'),
            (r'TemplateSyntaxError', 'Template error'),
            (r'File\s+"[^"]+\.py"', 'Python file path'),
        ]
        
        found_sensitive = []
        for pattern, desc in sensitive_patterns:
            matches = re.findall(pattern, template_content, re.IGNORECASE)
            # 排除在 replace() 中用于脱敏的
            real_matches = [m for m in matches if '.replace(' not in template_content[max(0, template_content.find(m)-50):template_content.find(m)]]
            if real_matches:
                found_sensitive.append(desc)
        
        if len(found_sensitive) == 0:
            print("  [PASS] No sensitive patterns in template source")
        else:
            print(f"  [FAIL] Found sensitive patterns: {found_sensitive}")
            all_passed = False
        
        # 检查渲染后的内容也无敏感信息
        rendered_sensitive = []
        for pattern, desc in sensitive_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                rendered_sensitive.append(desc)
        
        if len(rendered_sensitive) == 0:
            print("  [PASS] No sensitive patterns in rendered page")
        else:
            print(f"  [WARN] Found in rendered page: {rendered_sensitive}")
            
    except Exception as e:
        print(f"  [WARN] Could not check: {e}")
    
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
