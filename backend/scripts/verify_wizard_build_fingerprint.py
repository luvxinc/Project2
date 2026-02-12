#!/usr/bin/env python3
"""
GlobalWizard 构建指纹验证脚本

验证3件事：
1. [重复引入扫描] 所有 script 引入点 + 行号，确保最终只剩 1 个
2. [staticfiles_finders] 实际定位的 global-wizard.js 路径 + 前 10 行（必须含 build id）
3. [4 个页面 HTML] global-wizard.js 引用次数=1 且包含 ?v=build_id

BUILD_ID = "WIZARD_ANCHOR_V2_20251222_1"
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
from django.contrib.staticfiles import finders

User = get_user_model()

BUILD_ID = "WIZARD_ANCHOR_V2_20251222_1"


def scan_duplicate_imports():
    """
    Step 1: 扫描所有模板中的 global-wizard.js 引入
    """
    print("\n" + "=" * 70)
    print("[STEP 1] 扫描 global-wizard.js 重复引入")
    print("=" * 70)
    
    templates_dir = backend_dir / 'templates'
    results = []
    
    # 搜索所有 HTML 文件
    for html_file in templates_dir.rglob('*.html'):
        with open(html_file, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        for i, line in enumerate(lines, 1):
            if 'global-wizard.js' in line:
                rel_path = html_file.relative_to(backend_dir)
                # 判断引入方式
                if "{% static" in line:
                    import_type = "{% static %} (Django)"
                elif "/static/" in line:
                    import_type = "硬编码 /static/"
                else:
                    import_type = "其他方式"
                
                results.append({
                    'file': str(rel_path),
                    'line': i,
                    'content': line.strip()[:80],
                    'type': import_type
                })
    
    print(f"\n找到 {len(results)} 处 global-wizard.js 引入:")
    print("-" * 70)
    for r in results:
        print(f"   📄 {r['file']}:{r['line']}")
        print(f"      方式: {r['type']}")
        print(f"      内容: {r['content']}")
        print()
    
    if len(results) == 1:
        print("✅ PASS: 只有 1 处引入")
        return True
    else:
        print(f"❌ FAIL: 发现 {len(results)} 处引入（应该只有 1 处）")
        return False


def verify_staticfiles_path():
    """
    Step 2: 使用 staticfiles_finders 定位实际文件路径
    """
    print("\n" + "=" * 70)
    print("[STEP 2] staticfiles_finders 定位实际文件")
    print("=" * 70)
    
    path = finders.find('js/global-wizard.js')
    
    if not path:
        print("❌ FAIL: finders.find('js/global-wizard.js') 返回 None")
        print("   这意味着 Django 找不到这个静态文件！")
        return False
    
    print(f"\n实际文件路径: {path}")
    print("-" * 70)
    
    # 读取前 10 行
    with open(path, 'r', encoding='utf-8') as f:
        first_lines = f.readlines()[:10]
    
    print("\n文件前 10 行:")
    for i, line in enumerate(first_lines, 1):
        print(f"   {i:2}: {line.rstrip()}")
    
    # 检查是否包含 BUILD_ID
    content = ''.join(first_lines)
    if BUILD_ID in content:
        print(f"\n✅ PASS: 前 10 行包含 BUILD_ID = {BUILD_ID}")
        return True
    else:
        print(f"\n❌ FAIL: 前 10 行不包含 BUILD_ID = {BUILD_ID}")
        print("   这意味着运行时加载的文件不是你修改过的版本！")
        return False


def verify_page_html():
    """
    Step 3: 验证 4 个页面 HTML 中的引用
    """
    print("\n" + "=" * 70)
    print("[STEP 3] 验证页面 HTML 中的 global-wizard.js 引用")
    print("=" * 70)
    
    # 设置 Django client
    client = Client()
    username = 'test_build_verify'
    user, created = User.objects.get_or_create(
        username=username,
        defaults={'is_superuser': True, 'is_staff': True}
    )
    if created:
        user.set_password('testpass123')
        user.save()
    client.force_login(user)
    
    pages = [
        ('/dashboard/user_admin/register/', '注册新用户'),
        ('/dashboard/db_admin/clean/', '数据清洗'),
        ('/dashboard/purchase/add/', '新增供应商'),
        ('/dashboard/purchase/strategy/', '修改供应商策略'),
    ]
    
    all_passed = True
    
    for url, name in pages:
        print(f"\n检查: {name} ({url})")
        print("-" * 40)
        
        response = client.get(url)
        if response.status_code != 200:
            print(f"   ❌ HTTP {response.status_code}")
            all_passed = False
            continue
        
        html = response.content.decode('utf-8')
        
        # 计算 global-wizard.js 引用次数
        import_count = html.count('global-wizard.js')
        
        # 检查是否包含版本号
        has_version = f'global-wizard.js?v={BUILD_ID}' in html
        
        print(f"   引用次数: {import_count}")
        print(f"   包含版本号 ?v={BUILD_ID}: {'YES' if has_version else 'NO'}")
        
        if import_count == 1 and has_version:
            print(f"   ✅ PASS")
        else:
            print(f"   ❌ FAIL")
            if import_count != 1:
                print(f"      问题: 引用次数应该=1，实际={import_count}")
            if not has_version:
                print(f"      问题: 缺少版本号")
            all_passed = False
    
    return all_passed


def main():
    print("=" * 70)
    print("GlobalWizard 构建指纹验证")
    print(f"BUILD_ID: {BUILD_ID}")
    print("=" * 70)
    
    step1_ok = scan_duplicate_imports()
    step2_ok = verify_staticfiles_path()
    step3_ok = verify_page_html()
    
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    
    print(f"\n[Step 1] 重复引入扫描:       {'✅ PASS' if step1_ok else '❌ FAIL'}")
    print(f"[Step 2] staticfiles_finders: {'✅ PASS' if step2_ok else '❌ FAIL'}")
    print(f"[Step 3] 页面 HTML 引用:      {'✅ PASS' if step3_ok else '❌ FAIL'}")
    
    if step1_ok and step2_ok and step3_ok:
        print("\n✅ ALL BUILD FINGERPRINT CHECKS PASSED")
        print(f"\n运行时将加载: global-wizard.js?v={BUILD_ID}")
        print("该文件使用 [data-wizard-stepbar-anchor] 锚点，不会 fallback 到 container 顶部")
        sys.exit(0)
    else:
        print("\n❌ BUILD FINGERPRINT CHECKS FAILED")
        print("\n问题诊断:")
        if not step1_ok:
            print("   - 存在多处 global-wizard.js 引入，会导致 JS 执行多次")
        if not step2_ok:
            print("   - staticfiles_finders 找到的文件不是修改后的版本")
        if not step3_ok:
            print("   - 页面 HTML 中的引用不正确")
        sys.exit(1)


if __name__ == '__main__':
    main()
