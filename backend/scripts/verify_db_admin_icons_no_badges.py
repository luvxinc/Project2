#!/usr/bin/env python3
"""
Verify DB Admin Pages - Icons (No Colored Base)
================================================
验收脚本，检查数据库运维 3 个页面的标题区样式：
1. 每个页面返回 200
2. 关键标题附近（±150 字符）有 FontAwesome 图标
3. 关键标题附近（±150 字符）没有彩色底座特征
4. FontAwesome 资源正确引入

视觉契约：标题前只允许图标+文字，不允许任何带背景的 pill/circle 容器。
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

# 要检查的页面和对应标题
PAGES = [
    {
        'url': '/dashboard/db_admin/backup/',
        'name': '创建备份',
        'required_titles': ['备份状态', '操作须知'],
    },
    {
        'url': '/dashboard/db_admin/restore/',
        'name': '数据恢复',
        'required_titles': ['当前状态', '操作须知'],
    },
    {
        'url': '/dashboard/db_admin/manage/',
        'name': '备份管理',
        'required_titles': ['备份概览', '操作须知', '备份列表'],
    },
]

# 彩色底座特征（在标题附近出现即为 FAIL）
COLORED_BASE_PATTERNS = [
    r'rounded-circle',
    r'rounded-pill[^"]*p-\d',  # rounded-pill + padding = 底座
    r'bg-opacity-\d+[^"]*rounded',
    r'bg-\w+\s+bg-opacity-\d+[^"]*p-\d+',  # bg-xxx bg-opacity-xx p-x = 底座
]

SEARCH_RANGE = 150  # 标题前后各搜索 150 字符


def get_or_create_superuser():
    """获取或创建超级用户"""
    username = 'test_superadmin'
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


def check_fontawesome_in_base():
    """检查 base.html 是否引入了 FontAwesome"""
    base_path = backend_dir / 'templates' / 'layouts' / 'base.html'
    if not base_path.exists():
        return False, "base.html not found"
    
    with open(base_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    has_fa = 'font-awesome' in content.lower() or 'fontawesome' in content.lower()
    return has_fa, "FontAwesome found in base.html" if has_fa else "FontAwesome NOT found"


def get_nearby_content(content, title, range_size=SEARCH_RANGE):
    """获取标题附近的内容"""
    title_pos = content.find(title)
    if title_pos == -1:
        return None, -1
    
    start = max(0, title_pos - range_size)
    end = min(len(content), title_pos + len(title) + range_size)
    return content[start:end], title_pos


def check_icon_near_title(nearby_content, title):
    """检查标题附近是否有 FontAwesome 图标"""
    if nearby_content is None:
        return False, f"Title '{title}' not found"
    
    has_icon = bool(re.search(r'<i\s+class="[^"]*fa[sr]?\s+fa-[^"]+[^>]*>\s*</i>\s*' + re.escape(title), nearby_content))
    if not has_icon:
        # 更宽松检查：只要 title 附近有 <i class="fa
        has_icon = bool(re.search(r'<i\s+class="[^"]*fa', nearby_content)) and title in nearby_content
    
    return has_icon, "OK" if has_icon else f"No icon found near '{title}'"


def check_no_colored_base(nearby_content, title):
    """检查标题附近是否有彩色底座"""
    if nearby_content is None:
        return True, "Title not found (skipped)"
    
    issues = []
    for pattern in COLORED_BASE_PATTERNS:
        match = re.search(pattern, nearby_content)
        if match:
            # 获取匹配位置的上下文
            context_start = max(0, match.start() - 30)
            context_end = min(len(nearby_content), match.end() + 30)
            context = nearby_content[context_start:context_end].replace('\n', ' ')
            issues.append(f"Pattern '{pattern}' found: ...{context}...")
    
    return len(issues) == 0, issues


def main():
    print("=" * 70)
    print("DB Admin Pages - Icons Verification (No Colored Base)")
    print("视觉契约：标题前只允许图标+文字，不允许彩色底座容器")
    print("=" * 70)
    
    # Setup
    client = Client()
    user = get_or_create_superuser()
    client.force_login(user)
    
    all_passed = True
    
    # 0. Check FontAwesome in base.html
    print("\n0. FontAwesome Resource Check:")
    print("-" * 50)
    has_fa, fa_msg = check_fontawesome_in_base()
    print(f"   {'✅' if has_fa else '❌'} {fa_msg}")
    if not has_fa:
        all_passed = False
        print("\n[CRITICAL] FontAwesome not found in base.html!")
    
    # Check each page
    for page in PAGES:
        print(f"\n{page['name']} ({page['url']}):")
        print("-" * 50)
        
        # 1. Page status
        response = client.get(page['url'])
        status = response.status_code
        print(f"   {'✅' if status == 200 else '❌'} Page Status: {status}")
        
        if status != 200:
            all_passed = False
            continue
        
        content = response.content.decode('utf-8')
        
        # 2. Check each required title
        for title in page['required_titles']:
            nearby_content, pos = get_nearby_content(content, title)
            
            if nearby_content is None:
                print(f"   ❌ Title '{title}' NOT FOUND in page")
                all_passed = False
                continue
            
            # Check icon exists
            has_icon, icon_msg = check_icon_near_title(nearby_content, title)
            print(f"   {'✅' if has_icon else '❌'} Icon near '{title}'")
            if not has_icon:
                all_passed = False
                print(f"      Context: {nearby_content[:80].replace(chr(10), ' ')}...")
            
            # Check no colored base
            no_base, base_issues = check_no_colored_base(nearby_content, title)
            print(f"   {'✅' if no_base else '❌'} No colored base near '{title}'")
            if not no_base:
                all_passed = False
                for issue in base_issues[:2]:
                    print(f"      - {issue[:100]}")
    
    # Summary
    print("\n" + "=" * 70)
    if all_passed:
        print("🎉 RESULT: ALL VISUAL CONTRACT CHECKS PASSED")
        print("\nIcon Implementation Status:")
        print("  - FontAwesome resource: ✅")
        print("  - Icons near titles: ✅")
        print("  - No colored base containers: ✅")
    else:
        print("❌ RESULT: SOME CHECKS FAILED")
    print("=" * 70)
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    sys.exit(main())
