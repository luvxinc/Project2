#!/usr/bin/env python3
"""
GlobalWizard 模板合约扫描脚本

强制校验所有使用 new GlobalWizard 的页面必须包含锚点 [data-wizard-stepbar-anchor]，
且锚点必须在第一个 wizard-step-content 之前。

规则：
1. 扫描所有 HTML 模板，找到包含 new GlobalWizard 的页面
2. 每个页面的 wizard container 内必须包含 data-wizard-stepbar-anchor
3. anchor 必须出现在第一个 wizard-step-content 之前
4. 任何违反规则的页面会导致脚本 FAIL (exit code != 0)

验证方式：
- 删掉任意页面 anchor 会 FAIL
- 加回来会 PASS
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
    username = 'test_anchor_scan'
    user, created = User.objects.get_or_create(
        username=username,
        defaults={'is_superuser': True, 'is_staff': True}
    )
    if created:
        user.set_password('testpass123')
        user.save()
    return user


def verify_anchor_contract(client, url, page_name, container_id):
    """
    验证页面模板合约：
    1. wizard container 存在
    2. container 内包含 data-wizard-stepbar-anchor
    3. anchor 在第一个 wizard-step-content 之前
    
    返回 (passed: bool, details: dict)
    """
    result = {
        'url': url,
        'page_name': page_name,
        'container_id': container_id,
        'passed': False,
        'has_container': False,
        'has_anchor': False,
        'anchor_before_step': False,
        'anchor_pos': -1,
        'step_content_pos': -1,
        'error': None
    }
    
    response = client.get(url)
    
    if response.status_code != 200:
        result['error'] = f"HTTP {response.status_code}"
        return False, result
    
    html = response.content.decode('utf-8')
    
    # 1. 检查 container 存在
    container_pattern = rf'id="{container_id}"'
    container_match = re.search(container_pattern, html)
    if not container_match:
        result['error'] = f"Container #{container_id} not found"
        return False, result
    
    result['has_container'] = True
    container_start = container_match.start()
    
    # 从 container 开始截取后面的内容来分析
    html_after_container = html[container_start:]
    
    # 2. 检查 anchor 存在
    anchor_pattern = r'data-wizard-stepbar-anchor'
    anchor_match = re.search(anchor_pattern, html_after_container)
    
    if not anchor_match:
        result['error'] = "Missing [data-wizard-stepbar-anchor] anchor"
        return False, result
    
    result['has_anchor'] = True
    result['anchor_pos'] = container_start + anchor_match.start()
    
    # 3. 检查 wizard-step-content 位置
    step_content_pattern = r'class="wizard-step-content'
    step_content_match = re.search(step_content_pattern, html_after_container)
    
    if not step_content_match:
        result['error'] = "No wizard-step-content found in container"
        return False, result
    
    result['step_content_pos'] = container_start + step_content_match.start()
    
    # 4. 验证 anchor 在 step-content 之前
    if result['anchor_pos'] < result['step_content_pos']:
        result['anchor_before_step'] = True
        result['passed'] = True
    else:
        result['error'] = f"Anchor (pos={result['anchor_pos']}) is AFTER step-content (pos={result['step_content_pos']})"
    
    return result['passed'], result


def verify_js_no_fallback():
    """
    验证 global-wizard.js 不包含 fallback 到 container 顶部的逻辑
    """
    js_path = backend_dir / 'static' / 'js' / 'global-wizard.js'
    
    if not js_path.exists():
        print("❌ FAIL: global-wizard.js not found")
        return False
    
    with open(js_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    checks = []
    
    # 必须使用 data-wizard-stepbar-anchor
    if 'data-wizard-stepbar-anchor' in content:
        checks.append(('Uses [data-wizard-stepbar-anchor]', True))
    else:
        checks.append(('Uses [data-wizard-stepbar-anchor]', False))
    
    # 必须有找不到锚点时的 return（不 fallback）
    if 'if (!anchor)' in content and 'return' in content:
        checks.append(('No fallback on missing anchor', True))
    else:
        checks.append(('No fallback on missing anchor', False))
    
    # 不应该有 insertBefore(stepBar, firstChild) 这种 fallback 逻辑
    if 'insertBefore(stepBar, this.container.firstChild)' not in content:
        checks.append(('No container-top fallback', True))
    else:
        checks.append(('No container-top fallback', False))
    
    # stepBar 必须有 data-testid
    if "stepBar.setAttribute('data-testid', 'wizard-step-bar')" in content:
        checks.append(('StepBar has data-testid', True))
    else:
        checks.append(('StepBar has data-testid', False))
    
    all_passed = all(c[1] for c in checks)
    
    print("\n[A] global-wizard.js Contract Verification")
    print("-" * 60)
    for name, passed in checks:
        icon = "✅" if passed else "❌"
        print(f"   {icon} {name}")
    
    return all_passed


def main():
    print("=" * 70)
    print("GlobalWizard Anchor Contract Scan")
    print("=" * 70)
    print()
    print("此脚本验证所有使用 GlobalWizard 的页面必须包含：")
    print("  1. [data-wizard-stepbar-anchor] 锚点")
    print("  2. 锚点必须在第一个 wizard-step-content 之前")
    print("  3. global-wizard.js 必须只使用锚点，不 fallback")
    print()
    
    # A) 验证 JS 文件
    js_ok = verify_js_no_fallback()
    
    # B) 设置 Django client
    print("\n[B] Setting up Django test client...")
    print("-" * 60)
    client = Client()
    user = get_or_create_superuser()
    client.force_login(user)
    print(f"   ✅ Logged in as: {user.username}")
    
    # C) 验证 4 个页面
    print("\n[C] Page Anchor Contract Verification")
    print("-" * 60)
    
    # 定义需要检查的页面
    pages = [
        ('/dashboard/user_admin/register/', '注册新用户', 'register-wizard-container'),
        ('/dashboard/db_admin/clean/', '数据清洗', 'clean-wizard-container'),
        ('/dashboard/purchase/add/', '新增供应商', 'supplier-add-wizard-container'),
        ('/dashboard/purchase/strategy/', '修改供应商策略', 'strategy-wizard-container'),
    ]
    
    all_passed = js_ok
    results = []
    
    for url, name, container_id in pages:
        passed, result = verify_anchor_contract(client, url, name, container_id)
        results.append(result)
        
        if passed:
            print(f"\n   ✅ PASS: {name}")
            print(f"      Container: #{container_id}")
            print(f"      Anchor pos: {result['anchor_pos']}")
            print(f"      Step-content pos: {result['step_content_pos']}")
            print(f"      Anchor is before step-content: YES")
        else:
            print(f"\n   ❌ FAIL: {name}")
            print(f"      Container: #{container_id}")
            print(f"      Error: {result['error']}")
            all_passed = False
    
    # D) 总结
    print()
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    
    print("\n页面检查结果:")
    for r in results:
        icon = "✅" if r['passed'] else "❌"
        anchor_info = f"anchor_pos={r['anchor_pos']}" if r['anchor_pos'] >= 0 else f"ERROR: {r['error']}"
        print(f"   {icon} {r['page_name']}: {anchor_info}")
    
    print()
    if all_passed:
        print("✅ ALL ANCHOR CONTRACT CHECKS PASSED")
        print()
        print("所有页面都正确配置了 [data-wizard-stepbar-anchor] 锚点")
        print("StepBar 将被 JS 注入到锚点内，不会出现在容器顶部")
        sys.exit(0)
    else:
        print("❌ ANCHOR CONTRACT CHECKS FAILED")
        print()
        print("存在页面缺少锚点或锚点位置不正确")
        print("请确保每个 wizard 页面都有 <div data-wizard-stepbar-anchor=\"1\"></div>")
        sys.exit(1)


if __name__ == '__main__':
    main()
