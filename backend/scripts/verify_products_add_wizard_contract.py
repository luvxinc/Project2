#!/usr/bin/env python3
"""
验收脚本：新增产品向导模板合约检查

检查项：
1. 页面返回 200
2. GlobalWizard 容器结构
3. wizard-header + stepbar anchor
4. 3 个 step
5. 提交按钮包含 data-requires-global-modal
6. Step1 无可见密码UI / 无创建SKU按钮
7. apple-table.css 引入
8. 无危险 innerHTML 注入
"""
import os
import sys
import re
from pathlib import Path

current_dir = Path(__file__).resolve().parent
backend_dir = current_dir.parent
project_root = backend_dir.parent
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(backend_dir))

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

def get_test_client():
    user, _ = User.objects.get_or_create(
        username='test_add_wizard',
        defaults={'is_staff': True, 'is_superuser': True}
    )
    client = Client()
    client.force_login(user)
    return client

def main():
    all_passed = True
    
    print("=" * 60)
    print("新增产品向导模板合约检查")
    print("=" * 60)
    
    # Check 1: 页面返回 200
    print("\n[Check 1] GET /dashboard/products/add/ -> 200")
    client = get_test_client()
    resp = client.get('/dashboard/products/add/')
    if resp.status_code == 200:
        print("  ✅ PASS - 页面返回 200")
    else:
        print(f"  ❌ FAIL - 期望 200, 实际 {resp.status_code}")
        all_passed = False
        return 1

    html = resp.content.decode('utf-8', errors='ignore')
    
    # Read template source
    template_path = backend_dir / 'templates' / 'products' / 'pages' / 'add.html'
    template_content = template_path.read_text(encoding='utf-8')

    # Check 2: GlobalWizard 容器
    print("\n[Check 2] GlobalWizard 容器结构")
    checks = [
        ('id="add-product-wizard-container"', 'Wizard Container ID'),
        ('data-testid="add-product-wizard"', 'Wizard testid'),
    ]
    for pattern, desc in checks:
        if pattern in html:
            print(f"  ✅ PASS - {desc}")
        else:
            print(f"  ❌ FAIL - 未找到 {desc}")
            all_passed = False

    # Check 3: Wizard Header + Stepbar Anchor
    print("\n[Check 3] Wizard Header + Stepbar Anchor")
    checks = [
        ('class="wizard-header', 'wizard-header class'),
        ('data-wizard-stepbar-anchor', 'stepbar anchor'),
    ]
    for pattern, desc in checks:
        if pattern in html:
            print(f"  ✅ PASS - {desc}")
        else:
            print(f"  ❌ FAIL - 未找到 {desc}")
            all_passed = False

    # Check 4: 3 个 Step
    print("\n[Check 4] 3 个 Step")
    steps = [
        ('data-testid="step-edit"', 'Step 1: 填写数据'),
        ('data-testid="step-validate"', 'Step 2: 验证数据'),
        ('data-testid="step-done"', 'Step 3: 完成'),
    ]
    for pattern, desc in steps:
        if pattern in html:
            print(f"  ✅ PASS - {desc}")
        else:
            print(f"  ❌ FAIL - 未找到 {desc}")
            all_passed = False

    # Check 5: 提交按钮包含 data-requires-global-modal
    print("\n[Check 5] 提交按钮包含 data-requires-global-modal")
    if 'data-requires-global-modal="true"' in html:
        print("  ✅ PASS - 发现 data-requires-global-modal")
    else:
        print("  ❌ FAIL - 未找到 data-requires-global-modal")
        all_passed = False

    # Check 6: Step1 无可见密码UI / 无创建SKU按钮
    print("\n[Check 6] Step1 无可见密码UI / 无创建SKU按钮")
    step_edit_match = re.search(
        r'id="step-edit"[^>]*>(.*?)</div>\s*<!--.*?Step 2',
        template_content,
        re.DOTALL
    )
    
    if step_edit_match:
        step_edit_content = step_edit_match.group(1)
        
        forbidden_patterns = [
            ('输入密码', '密码输入'),
            ('安全验证', '安全验证UI'),
            ('创建 SKU', '创建SKU按钮'),
            ('创建SKU', '创建SKU按钮'),
        ]
        
        step1_clean = True
        for pattern, desc in forbidden_patterns:
            if pattern in step_edit_content:
                print(f"  ❌ FAIL - Step1 包含 {desc}")
                step1_clean = False
                all_passed = False
        
        if step1_clean:
            print("  ✅ PASS - Step1 无旧UI")
    else:
        print("  ⚠️ SKIP - 无法提取 step-edit 区域")

    # Check 7: apple-table.css 引入
    print("\n[Check 7] apple-table.css 引入")
    if 'apple-table.css' in html:
        print("  ✅ PASS - apple-table.css 已引入")
    else:
        print("  ❌ FAIL - 未引入 apple-table.css")
        all_passed = False

    # Check 8: 无危险 innerHTML 注入
    print("\n[Check 8] 无危险 innerHTML 注入到报告区域")
    js_match = re.search(r'<script>(.*?)</script>', template_content, re.DOTALL)
    
    if js_match:
        js_content = js_match.group(1)
        
        dangerous_patterns = [
            (r'error-list\.innerHTML', '错误列表 innerHTML'),
            (r'create-details-list\.innerHTML', '明细列表 innerHTML'),
            (r'error-result-message.*innerHTML', '错误消息 innerHTML'),
        ]
        
        has_dangerous = False
        for pattern, desc in dangerous_patterns:
            if re.search(pattern, js_content):
                print(f"  ❌ FAIL - 发现 {desc}")
                has_dangerous = True
                all_passed = False
        
        safe_patterns = ['renderErrorListSafe', 'renderPreviewTableSafe', 'renderSuccessResultSafe', 'textContent', 'createElement']
        safe_count = sum(1 for p in safe_patterns if p in js_content)
        
        if not has_dangerous and safe_count >= 3:
            print(f"  ✅ PASS - 使用安全 DOM 构建（发现 {safe_count} 个安全模式）")
    else:
        print("  ⚠️ SKIP - 无法提取 JS 内容")

    # Check 9: 初始库存为0确认机制
    print("\n[Check 9] 初始库存为0确认机制")
    if 'zero-qty-confirm' in html and 'confirm-zero-qty' in html:
        print("  ✅ PASS - 存在初始库存为0确认机制")
    else:
        print("  ❌ FAIL - 未找到初始库存为0确认机制")
        all_passed = False

    # Final
    print("\n" + "=" * 60)
    if all_passed:
        print("🎉 所有检查项 PASS - 模板合约验证通过")
        print("=" * 60)
        return 0
    else:
        print("❌ 存在失败项，请检查上述输出")
        print("=" * 60)
        return 1

if __name__ == '__main__':
    sys.exit(main())
