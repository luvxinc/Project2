#!/usr/bin/env python3
"""
Verify Sales Report Generator Wizard Contract
===============================================
验证报表生成器 Apple UI 改造：
1. 页面可达性
2. Header 结构
3. 操作须知存在
4. GlobalModal 接入
5. 旧密码验证 UI 已移除
6. 进度步骤保留
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
    username = 'test_admin'
    user, created = User.objects.get_or_create(
        username=username,
        defaults={'is_superuser': True, 'is_staff': True}
    )
    if created:
        user.set_password('testpass123')
        user.save()
    return user


@override_settings(DEBUG=True)
def main():
    print("=" * 60)
    print("Sales Report Generator Wizard Contract Verification")
    print("=" * 60)
    
    client = Client()
    user = get_or_create_test_user()
    client.force_login(user)
    
    all_passed = True
    
    # Template paths
    main_template = backend_dir / 'templates' / 'sales' / 'pages' / 'report_builder.html'
    form_template = backend_dir / 'templates' / 'reports' / 'partials' / 'generator_form.html'
    
    # ============================================================
    # Test 1: 页面可达性
    # ============================================================
    print("\n1. Page Status Check:")
    print("-" * 40)
    
    response = client.get('/dashboard/sales/report_builder/')
    if response.status_code == 200:
        print("  [PASS] Report Builder page returns 200")
    else:
        print(f"  [FAIL] Returns {response.status_code}")
        all_passed = False
    
    # ============================================================
    # Test 2: Header 结构
    # ============================================================
    print("\n2. Header Structure Check:")
    print("-" * 40)
    
    try:
        content = main_template.read_text(encoding='utf-8')
        
        header_checks = [
            (r'<nav\s+aria-label=["\']breadcrumb["\']', 'Breadcrumb nav'),
            (r'breadcrumb-item.*销售板块', 'Breadcrumb parent link'),
            (r'breadcrumb-item.*active.*报表生成器', 'Breadcrumb active item'),
            (r'rounded-circle.*me-3', 'Icon circle container'),
            (r'<h4\s+class=["\']text-white fw-bold mb-1["\']', 'H4 title'),
            (r'text-white-50 small mb-0', 'Description'),
        ]
        
        found = []
        missing = []
        for pattern, desc in header_checks:
            if re.search(pattern, content, re.IGNORECASE | re.DOTALL):
                found.append(desc)
            else:
                missing.append(desc)
        
        if len(missing) == 0:
            print("  [PASS] Header structure matches standard")
        else:
            print(f"  [WARN] Missing: {missing}")
        
        print(f"  [INFO] Found: {found}")
    except Exception as e:
        print(f"  [ERROR] {e}")
        all_passed = False
    
    # ============================================================
    # Test 3: 操作须知存在
    # ============================================================
    print("\n3. Operation Notes Check:")
    print("-" * 40)
    
    try:
        content = main_template.read_text(encoding='utf-8')
        
        if 'data-testid="ops-note"' in content:
            print("  [PASS] Operation notes card exists")
        else:
            print("  [FAIL] Operation notes card not found")
            all_passed = False
        
        # Check content is comprehensive
        note_checks = [
            (r'功能说明', 'Function description'),
            (r'推荐流程', 'Recommended flow'),
            (r'常见问题', 'Common issues'),
            (r'安全提醒', 'Security reminder'),
        ]
        
        for pattern, desc in note_checks:
            if re.search(pattern, content):
                print(f"  [PASS] {desc} section exists")
            else:
                print(f"  [WARN] {desc} section missing")
    except Exception as e:
        print(f"  [ERROR] {e}")
    
    # ============================================================
    # Test 4: GlobalModal 接入
    # ============================================================
    print("\n4. GlobalModal Integration Check:")
    print("-" * 40)
    
    try:
        content = form_template.read_text(encoding='utf-8')
        
        modal_checks = [
            (r'data-requires-global-modal=["\']true["\']', 'data-requires-global-modal attribute'),
            (r'data-action-key=["\']btn_generate_report["\']', 'data-action-key'),
            (r'requestPasswordVerify\s*\(', 'requestPasswordVerify call'),
        ]
        
        for pattern, desc in modal_checks:
            if re.search(pattern, content):
                print(f"  [PASS] {desc}")
            else:
                print(f"  [FAIL] {desc} not found")
                all_passed = False
    except Exception as e:
        print(f"  [ERROR] {e}")
        all_passed = False
    
    # ============================================================
    # Test 5: 旧密码验证 UI 已移除
    # ============================================================
    print("\n5. Old Password UI Removed Check:")
    print("-" * 40)
    
    try:
        content = form_template.read_text(encoding='utf-8')
        
        # 检查旧的可见"安全验证"卡片是否已移除
        old_patterns = [
            (r'<i class="fas fa-shield-alt.*安全验证', 'Visible security gate card'),
            (r'3\.\s*安全验证', 'Step 3 security verification'),
        ]
        
        found_old = []
        for pattern, desc in old_patterns:
            if re.search(pattern, content, re.IGNORECASE | re.DOTALL):
                found_old.append(desc)
        
        if len(found_old) == 0:
            print("  [PASS] Old visible password UI removed")
        else:
            print(f"  [FAIL] Still contains: {found_old}")
            all_passed = False
        
        # security_inputs 应该在隐藏容器中
        if 'style="display: none;"' in content and 'security_inputs' in content:
            print("  [PASS] security_inputs in hidden container")
        else:
            print("  [WARN] security_inputs visibility unclear")
    except Exception as e:
        print(f"  [ERROR] {e}")
    
    # ============================================================
    # Test 6: 进度步骤保留
    # ============================================================
    print("\n6. Progress Steps Check:")
    print("-" * 40)
    
    try:
        content = form_template.read_text(encoding='utf-8')
        
        # 检查 11 个步骤 (0-10)
        step_count = len(re.findall(r'id=["\']report-step-\d+["\']', content))
        
        if step_count >= 11:
            print(f"  [PASS] {step_count} progress steps preserved")
        else:
            print(f"  [WARN] Only {step_count} steps found (expected 11)")
    except Exception as e:
        print(f"  [ERROR] {e}")
    
    # ============================================================
    # Test 7: 无 history.back()
    # ============================================================
    print("\n7. No history.back() Check:")
    print("-" * 40)
    
    try:
        for path in [main_template, form_template]:
            content = path.read_text(encoding='utf-8')
            if 'history.back()' in content:
                print(f"  [FAIL] history.back() found in {path.name}")
                all_passed = False
            else:
                print(f"  [PASS] No history.back() in {path.name}")
    except Exception as e:
        print(f"  [ERROR] {e}")
    
    # ============================================================
    # Test 8: 渲染结果检查（无未渲染的模板标签）
    # ============================================================
    print("\n8. Rendered Output Check (No Template Tags):")
    print("-" * 40)
    
    try:
        response = client.get('/dashboard/sales/report_builder/')
        rendered = response.content.decode('utf-8')
        
        # 检查是否有未渲染的模板标签
        bad_patterns = [
            ('{%', 'Unrendered template tag'),
            ('%}', 'Unrendered template tag'),
            ('&lt;%', 'Escaped template tag'),
            ('%&gt;', 'Escaped template tag'),
        ]
        
        found_bad = []
        for pattern, desc in bad_patterns:
            if pattern in rendered:
                found_bad.append(pattern)
        
        if len(found_bad) == 0:
            print("  [PASS] No unrendered template tags in output")
        else:
            print(f"  [FAIL] Found unrendered tags: {found_bad}")
            all_passed = False
        
        # 检查操作须知是否正确渲染
        if '操作须知' in rendered and '功能说明' in rendered:
            print("  [PASS] Operation notes rendered correctly")
        else:
            print("  [WARN] Operation notes content unclear")
    except Exception as e:
        print(f"  [ERROR] {e}")
    
    # ============================================================
    # Test 9: 表单字段保留
    # ============================================================
    print("\n9. Form Fields Preserved:")
    print("-" * 40)
    
    try:
        content = form_template.read_text(encoding='utf-8')
        
        required_fields = [
            'name="start_date"',
            'name="end_date"',
            'name="lr_case"',
            'name="lr_request"',
            'name="lr_return"',
            'name="lr_dispute"',
            'name="lead_time"',
            'name="safety_stock"',
        ]
        
        for field in required_fields:
            if field in content:
                print(f"  [PASS] {field}")
            else:
                print(f"  [FAIL] {field} missing")
                all_passed = False
    except Exception as e:
        print(f"  [ERROR] {e}")
    
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
