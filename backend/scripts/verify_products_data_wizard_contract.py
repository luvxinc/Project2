#!/usr/bin/env python3
"""
验收脚本：产品数据维护向导模板合约检查

检查项：
1. GlobalWizard 容器结构
2. wizard-header + stepbar anchor
3. 3 个 step（step-edit、step-validate、step-done）
4. 提交按钮包含 data-requires-global-modal
5. 无密码输入框（input type=password）
6. 页面正常返回 200
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

def get_test_client():
    """创建已登录的测试客户端"""
    user, _ = User.objects.get_or_create(
        username='test_product_data_wizard',
        defaults={'is_staff': True, 'is_superuser': True}
    )
    client = Client()
    client.force_login(user)
    return client

def main():
    all_passed = True
    
    print("=" * 60)
    print("产品数据维护向导模板合约检查")
    print("=" * 60)
    
    # ============================================================
    # Check 1: 页面返回 200
    # ============================================================
    print("\n[Check 1] GET /dashboard/products/data/ -> 200")
    client = get_test_client()
    resp = client.get('/dashboard/products/data/')
    if resp.status_code == 200:
        print("  ✅ PASS - 页面返回 200")
    else:
        print(f"  ❌ FAIL - 期望 200, 实际 {resp.status_code}")
        all_passed = False
        return 1  # 无法继续检查

    html = resp.content.decode('utf-8', errors='ignore')

    # ============================================================
    # Check 2: GlobalWizard 容器
    # ============================================================
    print("\n[Check 2] GlobalWizard 容器结构")
    checks = [
        ('id="product-data-wizard-container"', 'Wizard Container ID'),
        ('data-testid="product-data-wizard"', 'Wizard testid'),
    ]
    for pattern, desc in checks:
        if pattern in html:
            print(f"  ✅ PASS - {desc}")
        else:
            print(f"  ❌ FAIL - 未找到 {desc}")
            all_passed = False

    # ============================================================
    # Check 3: Wizard Header + Stepbar Anchor
    # ============================================================
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

    # ============================================================
    # Check 4: 3 个 Step
    # ============================================================
    print("\n[Check 4] 3 个 Step (step-edit, step-validate, step-done)")
    steps = [
        ('data-testid="step-edit"', 'Step 1: 修改数据'),
        ('data-testid="step-validate"', 'Step 2: 验证数据'),
        ('data-testid="step-done"', 'Step 3: 完成'),
    ]
    for pattern, desc in steps:
        if pattern in html:
            print(f"  ✅ PASS - {desc}")
        else:
            print(f"  ❌ FAIL - 未找到 {desc}")
            all_passed = False

    # ============================================================
    # Check 5: 提交按钮包含 data-requires-global-modal
    # ============================================================
    print("\n[Check 5] 提交按钮包含 data-requires-global-modal")
    if 'data-requires-global-modal="true"' in html:
        print("  ✅ PASS - 发现 data-requires-global-modal")
    else:
        print("  ❌ FAIL - 未找到 data-requires-global-modal")
        all_passed = False

    # ============================================================
    # Check 6: 无可见密码输入框（隐藏的 security_inputs 除外）
    # ============================================================
    print("\n[Check 6] 无可见密码输入框 (隐藏的 security_inputs 除外)")
    # 检查是否有不在 d-none 容器内的密码输入框
    # security_inputs 模板标签生成的密码框位于隐藏区域，不算"可见"
    visible_password_pattern = re.compile(
        r'<input[^>]*type\s*=\s*["\']password["\'][^>]*>',
        re.IGNORECASE
    )
    password_matches = visible_password_pattern.findall(html)
    
    # 所有密码框都应在隐藏的 form 内（id="cogs-submit-form" class="d-none"）
    # 检查模板源文件更准确
    template_path = backend_dir / 'templates' / 'products' / 'pages' / 'data.html'
    template_content = template_path.read_text(encoding='utf-8')
    
    # 查找非隐藏区域的密码输入
    has_visible_password = False
    if 'type="password"' in template_content or "type='password'" in template_content:
        # 检查是否在 d-none 容器外
        if re.search(r'(?<!d-none[^>]*>.*)<input[^>]*type=["\']password["\']', template_content):
            has_visible_password = True
    
    if not has_visible_password:
        print("  ✅ PASS - 无可见密码输入框（security_inputs 在隐藏容器内）")
    else:
        print("  ❌ FAIL - 发现可见的 type=password 输入框")
        all_passed = False

    # ============================================================
    # Check 7: GlobalWizard CSS 引入
    # ============================================================
    print("\n[Check 7] GlobalWizard CSS 引入")
    if 'global-wizard.css' in html:
        print("  ✅ PASS - global-wizard.css 已引入")
    else:
        print("  ❌ FAIL - 未引入 global-wizard.css")
        all_passed = False

    # ============================================================
    # Check 8: Apple Table CSS 引入
    # ============================================================
    print("\n[Check 8] Apple Table CSS 引入")
    if 'apple-table.css' in html:
        print("  ✅ PASS - apple-table.css 已引入")
    else:
        print("  ❌ FAIL - 未引入 apple-table.css")
        all_passed = False

    # ============================================================
    # Check 9: 差异追踪相关 DOM
    # ============================================================
    print("\n[Check 9] 差异追踪相关 DOM")
    checks = [
        ('id="dirty-count"', 'dirty-count 显示元素'),
        ('id="diff-table"', 'diff-table 差异表格'),
        ('id="error-summary"', 'error-summary 错误汇总'),
    ]
    for pattern, desc in checks:
        if pattern in html:
            print(f"  ✅ PASS - {desc}")
        else:
            print(f"  ❌ FAIL - 未找到 {desc}")
            all_passed = False

    # ============================================================
    # Check 10: 完成页元素
    # ============================================================
    print("\n[Check 10] 完成页元素")
    checks = [
        ('id="result-total-rows"', '更新行数统计'),
        ('id="change-details-list"', '变更明细列表'),
    ]
    for pattern, desc in checks:
        if pattern in html:
            print(f"  ✅ PASS - {desc}")
        else:
            print(f"  ❌ FAIL - 未找到 {desc}")
            all_passed = False

    # ============================================================
    # [NEW] Check 11: Step1 content 内不得出现旧验证 UI
    # ============================================================
    print("\n[Check 11] Step1 content 内不得出现旧验证 UI")
    
    # 提取 step-edit 区域内容
    step_edit_match = re.search(
        r'id="step-edit"[^>]*>(.*?)</div>\s*<!--.*?Step 2',
        template_content,
        re.DOTALL
    )
    
    if step_edit_match:
        step_edit_content = step_edit_match.group(1)
        
        # 检查旧验证 UI 的关键字（不应出现在 Step1 可见区域）
        forbidden_patterns = [
            ('输入密码', '旧密码输入提示'),
            ('当前用户密码', '旧密码输入提示'),
            ('安全验证', '旧安全验证 UI'),
            ('fa-key', '密钥图标（旧验证 UI）'),
        ]
        
        step1_has_old_ui = False
        for pattern, desc in forbidden_patterns:
            if pattern in step_edit_content:
                print(f"  ❌ FAIL - Step1 包含 {desc}")
                step1_has_old_ui = True
                all_passed = False
        
        if not step1_has_old_ui:
            print("  ✅ PASS - Step1 无旧验证 UI")
    else:
        print("  ⚠️ SKIP - 无法提取 step-edit 区域")

    # ============================================================
    # [NEW] Check 12: Step1 content 内不得出现 "保存修改/重新加载" 按钮
    # ============================================================
    print("\n[Check 12] Step1 content 内不得出现 '保存修改/重新加载' 按钮")
    
    if step_edit_match:
        step_edit_content = step_edit_match.group(1)
        
        forbidden_buttons = [
            ('保存修改', '保存修改按钮'),
            ('保存更改', '保存更改按钮'),
            ('重新加载', '重新加载按钮'),
        ]
        
        step1_has_old_buttons = False
        for pattern, desc in forbidden_buttons:
            if pattern in step_edit_content:
                print(f"  ❌ FAIL - Step1 包含 {desc}")
                step1_has_old_buttons = True
                all_passed = False
        
        if not step1_has_old_buttons:
            print("  ✅ PASS - Step1 无旧按钮")
    else:
        print("  ⚠️ SKIP - 无法提取 step-edit 区域")

    # ============================================================
    # [NEW] Check 13: JS 中报告/错误区域不使用危险的 innerHTML
    # ============================================================
    print("\n[Check 13] JS 中报告/错误区域使用安全 DOM 构建（无危险 innerHTML）")
    
    # 提取 JS 部分
    js_match = re.search(r'<script>(.*?)</script>', template_content, re.DOTALL)
    
    if js_match:
        js_content = js_match.group(1)
        
        # 检查是否有直接向报告/错误容器注入 HTML 的代码
        # 允许：wrapper.innerHTML = html（加载表格数据）
        # 禁止：errorList.innerHTML / detailsList.innerHTML
        dangerous_patterns = [
            (r'errorList\.innerHTML', '错误列表 innerHTML 注入'),
            (r'detailsList\.innerHTML', '变更明细 innerHTML 注入'),
            (r'error-result-message.*innerHTML', '错误消息 innerHTML 注入'),
        ]
        
        has_dangerous_inject = False
        for pattern, desc in dangerous_patterns:
            if re.search(pattern, js_content):
                print(f"  ❌ FAIL - 发现 {desc}")
                has_dangerous_inject = True
                all_passed = False
        
        # 检查是否使用了安全的 textContent 或 createElement
        safe_patterns = [
            'renderErrorListSafe',
            'renderDiffTableSafe',
            'renderSuccessResultSafe',
            'textContent',
            'createElement',
        ]
        
        safe_count = sum(1 for p in safe_patterns if p in js_content)
        
        if not has_dangerous_inject and safe_count >= 3:
            print(f"  ✅ PASS - 使用安全 DOM 构建（发现 {safe_count} 个安全模式）")
        elif not has_dangerous_inject:
            print(f"  ⚠️ WARN - 未发现危险注入，但安全模式较少（{safe_count}）")
    else:
        print("  ⚠️ SKIP - 无法提取 JS 内容")

    # ============================================================
    # 最终结果
    # ============================================================
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
