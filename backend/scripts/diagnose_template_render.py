#!/usr/bin/env python3
"""
诊断 Django 模板变量未渲染问题
"""
import os
import sys
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


def main():
    # Setup
    client = Client()
    username = 'test_template_diag'
    user, created = User.objects.get_or_create(
        username=username,
        defaults={'is_superuser': True, 'is_staff': True}
    )
    if created:
        user.set_password('testpass123')
        user.save()
    client.force_login(user)
    
    print("=" * 70)
    print("Django 模板渲染诊断")
    print("=" * 70)
    
    # Test 系统故障监控页面
    pages = [
        ('/dashboard/audit/system/', '系统故障监控'),
        ('/dashboard/audit/business/', '业务操作日志'),
        ('/dashboard/audit/infra/', '数据层审计'),
    ]
    
    for url, name in pages:
        print(f"\n--- 检查: {name} ({url}) ---")
        response = client.get(url)
        print(f"Status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"   ❌ HTTP Error: {response.status_code}")
            continue
        
        html = response.content.decode('utf-8')
        
        # 检查是否有未渲染的模板语法
        unrendered_patterns = [
            '{{ logs|length',
            '{{ main_log.action',
            '{{logs',
            '{{ logs ',
        ]
        
        found_issues = []
        for pattern in unrendered_patterns:
            if pattern in html:
                # 找到上下文
                idx = html.find(pattern)
                start = max(0, idx - 50)
                end = min(len(html), idx + 100)
                context = html[start:end]
                found_issues.append((pattern, context))
        
        if found_issues:
            print(f"   ❌ 发现未渲染的模板语法:")
            for pattern, context in found_issues:
                print(f"      Pattern: {pattern}")
                print(f"      Context: ...{context}...")
                print()
        else:
            print(f"   ✅ 未发现未渲染的模板语法")
        
        # 检查 "共 X 条" 是否正确渲染
        import re
        count_match = re.search(r'共\s*(\d+|\{\{[^}]+\}\})\s*条', html)
        if count_match:
            matched = count_match.group(0)
            if '{{' in matched:
                print(f"   ❌ '共 X 条' 未渲染: {matched}")
            else:
                print(f"   ✅ '共 X 条' 已渲染: {matched}")


if __name__ == '__main__':
    main()
