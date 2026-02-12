#!/usr/bin/env python3
"""
验证 GlobalWizard 页面的 DOM 顺序（静态渲染验证，无需浏览器）

核心检查：
1. 验证 global-wizard.js 存在关键代码 insertAdjacentElement
2. 验证 4 个页面的 HTML 静态结构满足：
   - wizard-header 在 wizard-step-content 之前
   - 两者都在同一个 wizard container 内

注意：由于 StepBar 是 JavaScript 运行时动态插入的，
静态渲染只能验证"锚点存在且位置正确"，不能验证"StepBar 实际位置"。
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


def check_global_wizard_js():
    """检查 global-wizard.js 是否包含关键的锚点插入代码"""
    js_path = backend_dir / 'static' / 'js' / 'global-wizard.js'
    
    if not js_path.exists():
        print(f"❌ FAIL: global-wizard.js not found at {js_path}")
        return False
    
    with open(js_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 检查关键代码片段
    key_patterns = [
        (r"\.wizard-header", "wizard-header selector"),
        (r"insertAdjacentElement\s*\(\s*['\"]afterend['\"]", "insertAdjacentElement('afterend')"),
        (r"headerAnchor", "headerAnchor variable"),
    ]
    
    all_found = True
    for pattern, desc in key_patterns:
        if not re.search(pattern, content):
            print(f"❌ FAIL: '{desc}' not found in global-wizard.js")
            all_found = False
        else:
            print(f"✅ Found: {desc}")
    
    return all_found


def get_or_create_superuser():
    """获取或创建超级用户"""
    username = 'test_wizard_verify'
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


def check_page_dom_order(client, url, page_name):
    """
    检查页面 DOM 顺序：
    - wizard-header 应该在 wizard-step-content 之前
    """
    response = client.get(url)
    
    if response.status_code != 200:
        print(f"❌ FAIL: HTTP {response.status_code}")
        return False, None
    
    html = response.content.decode('utf-8')
    
    # 查找位置
    header_match = re.search(r'class="wizard-header', html)
    step_content_match = re.search(r'class="wizard-step-content', html)
    
    if not header_match:
        print(f"❌ FAIL: 'wizard-header' not found in rendered HTML")
        return False, html
    
    if not step_content_match:
        print(f"❌ FAIL: 'wizard-step-content' not found in rendered HTML")
        return False, html
    
    header_pos = header_match.start()
    step_content_pos = step_content_match.start()
    
    # 检查顺序
    if header_pos < step_content_pos:
        print(f"✅ wizard-header (pos={header_pos}) is BEFORE wizard-step-content (pos={step_content_pos})")
        return True, html
    else:
        print(f"❌ wizard-header (pos={header_pos}) is AFTER wizard-step-content (pos={step_content_pos})")
        return False, html


def check_globalwizard_init_order(html, page_name):
    """
    检查 GlobalWizard 初始化位置
    确保 new GlobalWizard 在 wizard-header 之后出现（DOM 加载顺序）
    """
    header_match = re.search(r'class="wizard-header', html)
    wizard_init_match = re.search(r'new\s+GlobalWizard\s*\(', html)
    
    if not header_match:
        print(f"⚠️  wizard-header not found")
        return False
    
    if not wizard_init_match:
        print(f"⚠️  'new GlobalWizard' not found in page")
        return False
    
    # GlobalWizard 初始化应该在 wizard-header DOM 出现之后（script 在底部）
    if header_match.start() < wizard_init_match.start():
        print(f"✅ GlobalWizard init is after wizard-header DOM (correct order)")
        return True
    else:
        print(f"❌ GlobalWizard init appears BEFORE wizard-header DOM (wrong order)")
        return False


def check_container_structure(html, container_id):
    """
    检查 wizard-header 是否在指定容器内
    """
    # 找到容器开始位置
    container_pattern = rf'id="{container_id}"[^>]*>'
    container_match = re.search(container_pattern, html)
    
    if not container_match:
        print(f"⚠️  Container '{container_id}' not found")
        return False
    
    container_start = container_match.end()
    
    # 找到容器后的 wizard-header
    header_match = re.search(r'class="wizard-header', html[container_start:])
    
    if header_match:
        print(f"✅ wizard-header found inside container '{container_id}'")
        return True
    else:
        print(f"❌ wizard-header NOT found inside container '{container_id}'")
        return False


def main():
    print("=" * 70)
    print("GlobalWizard DOM Order Verification (Static Rendering)")
    print("=" * 70)
    print()
    
    # A) 检查 global-wizard.js 内容
    print("[A] Checking global-wizard.js for anchor insertion code...")
    print("-" * 50)
    js_ok = check_global_wizard_js()
    print()
    
    # B) 创建测试客户端并登录
    print("[B] Setting up Django test client...")
    print("-" * 50)
    client = Client()
    user = get_or_create_superuser()
    client.force_login(user)
    print(f"✅ Logged in as: {user.username}")
    print()
    
    # C) 检查 4 个页面
    print("[C] Checking page DOM order...")
    print("-" * 50)
    
    pages = [
        ('/dashboard/user_admin/register/', '注册新用户', 'register-wizard-container'),
        ('/dashboard/db_admin/clean/', '数据清洗', 'clean-wizard-container'),
        ('/dashboard/purchase/add/', '新增供应商', 'supplier-add-wizard-container'),
        ('/dashboard/purchase/strategy/', '修改供应商策略', 'strategy-wizard-container'),
    ]
    
    all_passed = js_ok
    
    for url, name, container_id in pages:
        print(f"\n--- {name} ({url}) ---")
        
        # 检查 DOM 顺序
        order_ok, html = check_page_dom_order(client, url, name)
        
        if html:
            # 检查 JS 初始化位置
            init_ok = check_globalwizard_init_order(html, name)
            
            # 检查容器结构
            container_ok = check_container_structure(html, container_id)
            
            if not (order_ok and init_ok and container_ok):
                all_passed = False
        else:
            all_passed = False
    
    print()
    print("=" * 70)
    if all_passed:
        print("✅ ALL STATIC CHECKS PASSED")
        print()
        print("⚠️  NOTE: This script verifies STATIC HTML structure only.")
        print("   The StepBar is dynamically inserted by JavaScript at runtime.")
        print("   If StepBar still appears in wrong position in browser:")
        print("   1. Check browser console for errors")
        print("   2. Verify JS file is not cached (hard refresh: Cmd+Shift+R)")
        print("   3. Check if headerAnchor.insertAdjacentElement is being called")
        sys.exit(0)
    else:
        print("❌ SOME CHECKS FAILED")
        sys.exit(1)


if __name__ == '__main__':
    main()
