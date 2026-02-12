#!/usr/bin/env python3
"""
Verify Sales Visuals UI Contract
=================================
验证销售板块数据交互可视化 UI 改造后的契约：
1. 页面可达性
2. 旧锁屏 UI 已移除
3. GlobalModal 触发点存在
4. Header 结构符合标准
5. 图表关键代码未被改动
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
    print("Sales Visuals UI Contract Verification")
    print("=" * 60)
    
    client = Client()
    user = get_or_create_test_user()
    client.force_login(user)
    
    all_passed = True
    
    # 模板文件路径
    template_path = backend_dir / 'templates' / 'visuals' / 'index.html'
    dashboard_content_path = backend_dir / 'templates' / 'visuals' / 'partials' / 'dashboard_content.html'
    
    # ============================================================
    # Test 1: 页面可达性
    # ============================================================
    print("\n1. Route Status Check:")
    print("-" * 40)
    
    response = client.get('/dashboard/sales/visuals/')
    if response.status_code == 200:
        print("  [PASS] /dashboard/sales/visuals/ returns 200")
        content = response.content.decode('utf-8')
    else:
        print(f"  [FAIL] /dashboard/sales/visuals/ returns {response.status_code}")
        all_passed = False
        content = ""
    
    # ============================================================
    # Test 2: 旧锁屏 UI 已移除（模板源文件检查）
    # ============================================================
    print("\n2. Old Lock Screen UI Removed Check:")
    print("-" * 40)
    
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        old_ui_patterns = [
            (r'id=["\']lock-screen["\']', 'Old lock-screen ID'),
            (r'hx-post=.*unlock.*hx-target', 'HTMX unlock form'),
            (r'animate__zoomIn', 'Old animation class'),
            (r'Data Visualization.*RESTRICTED ACCESS', 'Old restricted access text'),
        ]
        
        found_old = []
        for pattern, desc in old_ui_patterns:
            if re.search(pattern, template_content, re.IGNORECASE | re.DOTALL):
                found_old.append(desc)
        
        if len(found_old) == 0:
            print("  [PASS] Old lock screen UI has been removed")
        else:
            print(f"  [FAIL] Old UI elements found: {found_old}")
            all_passed = False
    except Exception as e:
        print(f"  [ERROR] Could not read template: {e}")
        all_passed = False
    
    # ============================================================
    # Test 3: GlobalModal 触发点存在
    # ============================================================
    print("\n3. GlobalModal Integration Check:")
    print("-" * 40)
    
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        modal_checks = [
            (r'data-requires-global-modal=["\']true["\']', 'data-requires-global-modal attribute'),
            (r'data-action-key=["\']btn_unlock_visuals["\']', 'data-action-key for unlock'),
            (r'requestPasswordVerify\s*\(', 'requestPasswordVerify call'),
        ]
        
        for pattern, desc in modal_checks:
            if re.search(pattern, template_content):
                print(f"  [PASS] {desc}")
            else:
                print(f"  [FAIL] {desc} not found")
                all_passed = False
    except Exception as e:
        print(f"  [ERROR] Could not check: {e}")
        all_passed = False
    
    # ============================================================
    # Test 4: Header 结构符合标准
    # ============================================================
    print("\n4. Header Structure Check:")
    print("-" * 40)
    
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        header_checks = [
            (r'<nav\s+aria-label=["\']breadcrumb["\']', 'Breadcrumb nav'),
            (r'breadcrumb-item.*销售板块', 'Breadcrumb parent link'),
            (r'breadcrumb-item.*active.*数据交互可视化', 'Breadcrumb active item'),
            (r'rounded-circle.*me-3', 'Icon circle container'),
            (r'<h4\s+class=["\']text-white fw-bold mb-1["\']', 'H4 title with correct class'),
            (r'text-white-50 small mb-0', 'Description with correct class'),
            (r'返回销售板块', 'Back to hub button'),
        ]
        
        found = []
        missing = []
        for pattern, desc in header_checks:
            if re.search(pattern, template_content, re.IGNORECASE | re.DOTALL):
                found.append(desc)
            else:
                missing.append(desc)
        
        if len(missing) == 0:
            print(f"  [PASS] Header structure matches standard")
        else:
            print(f"  [WARN] Missing header elements: {missing}")
        
        if found:
            print(f"  [INFO] Found: {found}")
    except Exception as e:
        print(f"  [ERROR] Could not check: {e}")
    
    # ============================================================
    # Test 5: 无 history.back()
    # ============================================================
    print("\n5. No history.back() Check:")
    print("-" * 40)
    
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        if 'history.back()' in template_content:
            print("  [FAIL] history.back() found in template")
            all_passed = False
        else:
            print("  [PASS] No history.back() in template")
    except Exception as e:
        print(f"  [ERROR] Could not check: {e}")
    
    # ============================================================
    # Test 6: 图表关键代码未被改动
    # ============================================================
    print("\n6. Chart Code Protection Check:")
    print("-" * 40)
    
    try:
        # 读取所有相关模板文件
        all_visuals_content = ""
        visuals_dir = backend_dir / 'templates' / 'visuals'
        for f in visuals_dir.rglob('*.html'):
            all_visuals_content += f.read_text(encoding='utf-8')
        
        # 关键函数和容器必须存在
        protected_patterns = [
            (r'window\.app\s*=', 'window.app object'),
            (r'refresh:\s*async\s*function', 'app.refresh function'),
            (r'class\s+LineSFXController', 'LineSFXController class'),
            (r'id=["\']echarts-dom["\']', 'echarts-dom container'),
            (r'id=["\']sfx-canvas["\']', 'sfx-canvas container'),
            (r'id=["\']viz-container["\']', 'viz-container'),
            (r'id=["\']chart-loader["\']', 'chart-loader'),
        ]
        
        for pattern, desc in protected_patterns:
            if re.search(pattern, all_visuals_content):
                print(f"  [PASS] {desc} preserved")
            else:
                print(f"  [FAIL] {desc} missing or modified")
                all_passed = False
    except Exception as e:
        print(f"  [ERROR] Could not check visuals templates: {e}")
    
    # ============================================================
    # Test 7: security_inputs 存在
    # ============================================================
    print("\n7. Security Inputs Check:")
    print("-" * 40)
    
    try:
        template_content = template_path.read_text(encoding='utf-8')
        
        if "security_inputs 'btn_unlock_visuals'" in template_content:
            print("  [PASS] security_inputs for btn_unlock_visuals present")
        else:
            print("  [FAIL] security_inputs not found")
            all_passed = False
    except Exception as e:
        print(f"  [ERROR] Could not check: {e}")
    
    # ============================================================
    # Test 8: 脱敏检查
    # ============================================================
    print("\n8. Desensitization Check:")
    print("-" * 40)
    
    sensitive_patterns = [
        (r'/Users/[^\s]+', 'Local path'),
        (r'TemplateSyntaxError', 'Template error'),
    ]
    
    all_clean = True
    try:
        template_content = template_path.read_text(encoding='utf-8')
        for pattern, desc in sensitive_patterns:
            if re.search(pattern, template_content):
                print(f"  [FAIL] {desc} found in template")
                all_clean = False
                all_passed = False
        
        if all_clean:
            print("  [PASS] No sensitive information in template")
    except Exception as e:
        print(f"  [ERROR] Could not check: {e}")
    
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
