#!/usr/bin/env python3
"""
Verify Sales Transaction Upload Wizard Contract
=================================================
验证交易数据上传 Apple UI 改造：
1. 页面可达性
2. Header 结构
3. 向导步骤
4. GlobalModal 接入
5. 旧密码验证 UI 已移除
6. 旧错误 modal 逻辑替换为检验步骤
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
    print("Sales Transaction Upload Wizard Contract Verification")
    print("=" * 60)
    
    client = Client()
    user = get_or_create_test_user()
    client.force_login(user)
    
    all_passed = True
    
    # Template paths
    main_template = backend_dir / 'templates' / 'sales' / 'pages' / 'upload.html'
    tab_template = backend_dir / 'templates' / 'etl' / 'tab_transaction.html'
    step_upload = backend_dir / 'templates' / 'etl' / 'partials' / 'step_upload.html'
    step_validate = backend_dir / 'templates' / 'etl' / 'partials' / 'step_validate.html'
    step_transform = backend_dir / 'templates' / 'etl' / 'partials' / 'step_transform.html'
    error_modal = backend_dir / 'templates' / 'etl' / 'partials' / 'error_modal.html'
    
    # ============================================================
    # Test 1: 页面可达性
    # ============================================================
    print("\n1. Page Status Check:")
    print("-" * 40)
    
    response = client.get('/dashboard/sales/upload/')
    if response.status_code == 200:
        print("  [PASS] Upload page returns 200")
    else:
        print(f"  [FAIL] Returns {response.status_code}")
        all_passed = False
    
    # Test HTMX endpoint (tab_transaction)
    response2 = client.get('/dashboard/sales/transactions/tab/transaction/')
    if response2.status_code == 200:
        print("  [PASS] tab_transaction endpoint returns 200")
    else:
        print(f"  [FAIL] tab_transaction returns {response2.status_code}")
        if response2.status_code == 404:
            print("  [DEBUG] This is the HTMX endpoint loaded on page init!")
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
            (r'breadcrumb-item.*销售板块', 'Breadcrumb parent'),
            (r'breadcrumb-item.*交易数据上传', 'Breadcrumb active'),
            (r'rounded-circle.*me-3', 'Icon circle'),
            (r'<h4\s+class=["\']text-white fw-bold', 'H4 title'),
        ]
        
        found = []
        for pattern, desc in header_checks:
            if re.search(pattern, content, re.IGNORECASE | re.DOTALL):
                found.append(desc)
        
        if len(found) >= 4:
            print("  [PASS] Header structure matches standard")
        else:
            print(f"  [WARN] Only found: {found}")
        
        print(f"  [INFO] Found: {found}")
    except Exception as e:
        print(f"  [ERROR] {e}")
        all_passed = False
    
    # ============================================================
    # Test 3: 向导步骤数量
    # ============================================================
    print("\n3. Wizard Steps Check:")
    print("-" * 40)
    
    try:
        content = tab_template.read_text(encoding='utf-8')
        
        # 检查步骤标签
        steps = ['上传', '检验', '解析', '清洗', '入库', '完成']
        found_steps = []
        for step in steps:
            if step in content:
                found_steps.append(step)
        
        if len(found_steps) >= 5:
            print(f"  [PASS] Found {len(found_steps)} wizard steps")
        else:
            print(f"  [WARN] Only found {len(found_steps)} steps: {found_steps}")
        
        # 检查 validate stage
        if 'validate' in content:
            print("  [PASS] New 'validate' stage exists")
        else:
            print("  [WARN] 'validate' stage not found")
    except Exception as e:
        print(f"  [ERROR] {e}")
    
    # ============================================================
    # Test 4: 操作须知存在
    # ============================================================
    print("\n4. Operation Notes Check:")
    print("-" * 40)
    
    try:
        for name, path in [('upload', step_upload), ('validate', step_validate), ('transform', step_transform)]:
            if path.exists():
                content = path.read_text(encoding='utf-8')
                if 'ops-note' in content or '操作须知' in content:
                    print(f"  [{name}] [PASS] Operation notes found")
                else:
                    print(f"  [{name}] [WARN] Operation notes not found")
            else:
                print(f"  [{name}] [SKIP] Template not found")
    except Exception as e:
        print(f"  [ERROR] {e}")
    
    # ============================================================
    # Test 5: GlobalModal 接入
    # ============================================================
    print("\n5. GlobalModal Integration Check:")
    print("-" * 40)
    
    try:
        content = step_transform.read_text(encoding='utf-8')
        
        modal_checks = [
            (r'data-requires-global-modal=["\']true["\']', 'data-requires-global-modal'),
            (r'data-action-key=["\']btn_run_transform["\']', 'data-action-key'),
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
    # Test 6: 旧密码验证 UI 已移除
    # ============================================================
    print("\n6. Old Password UI Removed Check:")
    print("-" * 40)
    
    try:
        content = step_transform.read_text(encoding='utf-8')
        
        old_patterns = [
            (r'<i class="fa-solid fa-shield-halved.*安全验证', 'Visible security card'),
            (r'请输入授权密码确认', 'Old password prompt'),
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
    # Test 7: 检验步骤存在（替代旧 error_modal）
    # ============================================================
    print("\n7. Validate Step (Replacing Error Modal) Check:")
    print("-" * 40)
    
    if step_validate.exists():
        print("  [PASS] step_validate.html exists")
        
        content = step_validate.read_text(encoding='utf-8')
        
        # 检查错误展示区域
        if 'error-summary' in content or '检验失败' in content:
            print("  [PASS] Error display area exists")
        else:
            print("  [WARN] Error display area not found")
        
        # 检查 disabled 按钮
        if 'disabled' in content:
            print("  [PASS] Disabled button for failed validation")
        else:
            print("  [WARN] No disabled button found")
    else:
        print("  [FAIL] step_validate.html not found")
        all_passed = False
    
    # ============================================================
    # Test 8: 无 history.back()
    # ============================================================
    print("\n8. No history.back() Check:")
    print("-" * 40)
    
    templates = [main_template, tab_template, step_upload, step_transform]
    if step_validate.exists():
        templates.append(step_validate)
    
    for path in templates:
        if path.exists():
            content = path.read_text(encoding='utf-8')
            if 'history.back()' in content:
                print(f"  [FAIL] history.back() in {path.name}")
                all_passed = False
            else:
                print(f"  [PASS] No history.back() in {path.name}")
    
    # ============================================================
    # Test 9: 渲染结果检查
    # ============================================================
    print("\n9. Rendered Output Check:")
    print("-" * 40)
    
    try:
        response = client.get('/dashboard/sales/upload/')
        rendered = response.content.decode('utf-8')
        
        bad_patterns = ['{%', '%}']
        found_bad = [p for p in bad_patterns if p in rendered]
        
        if len(found_bad) == 0:
            print("  [PASS] No unrendered template tags")
        else:
            print(f"  [FAIL] Found unrendered tags: {found_bad}")
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
