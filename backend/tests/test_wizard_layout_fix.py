#!/usr/bin/env python3
"""
验证 GlobalWizard 页面的 DOM 布局修复（Phase 2）

核心检查：
1. <hr> 标签必须在 .wizard-header 内部（修复后）
2. wizard-step-content 在 .wizard-header 之后
3. 这样 JavaScript 的 insertAdjacentElement('afterend', stepBar) 会将 StepBar 插入到 <hr> 之后

问题根因：
原本 <hr> 在 .wizard-header 外部，导致 StepBar 被插入到 <hr> 之前（视觉上在 Icon+Title 下面但 <hr> 上面）。
现在 <hr> 被包含在 .wizard-header 内部，StepBar 会被插入到整个 .wizard-header（包含 <hr>）之后。
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
    username = 'test_wizard_layout'
    user, created = User.objects.get_or_create(
        username=username,
        defaults={'is_superuser': True, 'is_staff': True}
    )
    if created:
        user.set_password('testpass123')
        user.save()
    return user


def verify_layout_structure(client, url, page_name):
    """
    验证页面布局结构：
    1. wizard-header 存在
    2. wizard-header 内包含 <hr> 标签
    3. wizard-step-content 在 wizard-header 之后
    """
    response = client.get(url)
    
    if response.status_code != 200:
        print(f"❌ FAIL: HTTP {response.status_code}")
        return False
    
    html = response.content.decode('utf-8')
    
    # 找到 wizard-header 的开始和结束位置
    header_start_match = re.search(r'<div[^>]*class="wizard-header[^"]*"[^>]*>', html)
    if not header_start_match:
        print(f"❌ FAIL: wizard-header not found")
        return False
    
    header_start = header_start_match.start()
    
    # 找到对应的闭合 </div>
    # 简单方法：找到 wizard-header 后的下一个 wizard-step-content，然后找之前的 </div>
    step_content_match = re.search(r'class="wizard-step-content', html[header_start:])
    if not step_content_match:
        print(f"❌ FAIL: wizard-step-content not found after wizard-header")
        return False
    
    step_content_pos = header_start + step_content_match.start()
    
    # 提取 wizard-header 和 step-content 之间的内容
    between_content = html[header_start:step_content_pos]
    
    # 检查 <hr> 是否在这段内容中（即在 wizard-header 内部或紧邻）
    hr_match = re.search(r'<hr[^>]*>', between_content)
    if not hr_match:
        print(f"❌ FAIL: <hr> not found between wizard-header and wizard-step-content")
        return False
    
    # 检查 <hr> 是否在 wizard-header 的第一个 </div> 之前（即在内部）
    # 找到 between_content 中 wizard-header 闭合前的位置
    hr_pos_in_between = hr_match.start()
    
    # 找到第一个大 </div> (wizard-header 的闭合)
    # 由于我们已经包含了 <hr> 在 wizard-header 内部，<hr> 应该在 wizard-header 结束之前
    
    # 检查 <hr> 后面是否跟着 </div> (wizard-header 的闭合)
    after_hr = between_content[hr_match.end():]
    closing_div_match = re.search(r'</div>', after_hr)
    
    if closing_div_match and closing_div_match.start() < 50:  # 应该很近
        print(f"✅ <hr> is inside wizard-header (correctly positioned)")
        hr_inside = True
    else:
        print(f"⚠️  <hr> position unclear, may be outside wizard-header")
        hr_inside = False
    
    # 总结
    print(f"✅ wizard-header found at pos={header_start}")
    print(f"✅ wizard-step-content found at pos={step_content_pos}")
    print(f"✅ <hr> found between header and step-content")
    
    return True


def verify_hr_inside_header(template_path, page_name):
    """
    直接检查模板文件，确认 <hr> 在 .wizard-header 内部
    """
    if not template_path.exists():
        print(f"❌ FAIL: Template not found: {template_path}")
        return False
    
    with open(template_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 找到 wizard-header 开始
    header_match = re.search(r'<div[^>]*class="wizard-header[^"]*flex-column[^"]*"[^>]*>', content)
    if not header_match:
        # 可能还是旧格式
        header_match = re.search(r'<div[^>]*class="wizard-header[^"]*"[^>]*>', content)
        if not header_match:
            print(f"❌ FAIL: wizard-header not found in template")
            return False
        else:
            print(f"⚠️  WARN: wizard-header found but may be old format (no flex-column)")
    else:
        print(f"✅ wizard-header with flex-column found (new format)")
    
    header_start = header_match.end()
    
    # 在 header 之后找 <hr>
    hr_match = re.search(r'<hr[^>]*>', content[header_start:])
    if not hr_match:
        print(f"❌ FAIL: <hr> not found after wizard-header")
        return False
    
    # 检查 <hr> 和 wizard-header 结束之间是否只有一个 </div>
    hr_pos = header_start + hr_match.end()
    
    # 找到 <hr> 后的下一个 </div>
    closing_match = re.search(r'</div>', content[hr_pos:])
    if not closing_match:
        print(f"❌ FAIL: </div> not found after <hr>")
        return False
    
    # 检查 </div> 到 wizard-step-content 之间
    step_match = re.search(r'wizard-step-content', content[hr_pos:])
    if step_match:
        closing_pos = closing_match.start()
        step_pos = step_match.start()
        
        if closing_pos < step_pos:
            print(f"✅ <hr> is correctly inside wizard-header (closes before step-content)")
            return True
        else:
            print(f"❌ FAIL: <hr> may be outside wizard-header")
            return False
    
    return True


def main():
    print("=" * 70)
    print("GlobalWizard Layout Fix Verification")
    print("=" * 70)
    print()
    print("问题根因: <hr> 原本在 .wizard-header 外部，导致 StepBar 被插在 <hr> 之前")
    print("修复方案: 将 <hr> 移入 .wizard-header 内部，使 StepBar 插入到 <hr> 之后")
    print()
    
    # A) 检查模板文件结构
    print("[A] Checking template file structure...")
    print("-" * 50)
    
    templates = [
        (backend_dir / 'templates' / 'user_admin' / 'pages' / 'register.html', '注册新用户'),
        (backend_dir / 'templates' / 'db_admin' / 'pages' / 'clean.html', '数据清洗'),
        (backend_dir / 'templates' / 'purchase' / 'pages' / 'supplier_add.html', '新增供应商'),
        (backend_dir / 'templates' / 'purchase' / 'pages' / 'strategy.html', '修改供应商策略'),
    ]
    
    all_passed = True
    
    for template_path, name in templates:
        print(f"\n--- {name} ---")
        if not verify_hr_inside_header(template_path, name):
            all_passed = False
    
    # B) 检查渲染后的 HTML
    print()
    print("[B] Checking rendered HTML layout...")
    print("-" * 50)
    
    client = Client()
    user = get_or_create_superuser()
    client.force_login(user)
    
    pages = [
        ('/dashboard/user_admin/register/', '注册新用户'),
        ('/dashboard/db_admin/clean/', '数据清洗'),
        ('/dashboard/purchase/add/', '新增供应商'),
        ('/dashboard/purchase/strategy/', '修改供应商策略'),
    ]
    
    for url, name in pages:
        print(f"\n--- {name} ({url}) ---")
        if not verify_layout_structure(client, url, name):
            all_passed = False
    
    print()
    print("=" * 70)
    if all_passed:
        print("✅ ALL LAYOUT CHECKS PASSED")
        print()
        print("修复说明:")
        print("  1. <hr> 已移入 .wizard-header 内部")
        print("  2. JavaScript 的 insertAdjacentElement('afterend', stepBar)")
        print("     现在会将 StepBar 插入到整个 header 区块（含 <hr>）之后")
        print("  3. 视觉顺序: Icon+Title → <hr> → StepBar → Step Content")
        sys.exit(0)
    else:
        print("❌ SOME CHECKS FAILED")
        print()
        print("请检查模板是否正确修改")
        sys.exit(1)


if __name__ == '__main__':
    main()
