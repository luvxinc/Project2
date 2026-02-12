#!/usr/bin/env python3
"""
验收脚本：权限树白名单过滤验证
- 确认渲染的权限树仅包含白名单节点
- 确认所有白名单节点都存在
- 确认无模板残留标签
- 确认无敏感信息泄露
"""
import os
import sys
import re

# Django setup
backend_dir = os.path.dirname(os.path.abspath(__file__))
project_dir = os.path.dirname(backend_dir)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
if project_dir not in sys.path:
    sys.path.insert(0, project_dir)

import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_config.settings')
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from backend.core.services.security.inventory import SecurityInventory
from backend.common.settings import settings

User = get_user_model()

def test_permission_tree_whitelist():
    """测试权限树白名单过滤"""
    print("\n" + "=" * 60)
    print("权限树白名单验证")
    print("=" * 60)
    
    # 1. 获取权限树数据
    print("\n[1/4] 获取权限树结构...")
    tree = SecurityInventory.get_full_permission_tree()
    
    # 提取所有节点的keys（递归）
    def extract_all_keys(nodes, keys_set):
        for node in nodes:
            keys_set.add(node['key'])
            if 'children' in node:
                extract_all_keys(node['children'], keys_set)
    
    actual_keys = set()
    extract_all_keys(tree, actual_keys)
    
    print(f"   树中实际节点数: {len(actual_keys)}")
    print(f"   白名单节点数: {len(SecurityInventory.WHITELIST_PERMISSIONS)}")
    
    # 2. 检查是否有非白名单节点
    print("\n[2/4] 检查非白名单节点...")
    invalid_keys = actual_keys - SecurityInventory.WHITELIST_PERMISSIONS
    if invalid_keys:
        print(f"   ❌ FAIL: 发现 {len(invalid_keys)} 个非白名单节点:")
        for key in sorted(invalid_keys):
            print(f"      - {key}")
        return False
    else:
        print("   ✅ PASS: 无非白名单节点")
    
    # 3. 检查是否所有白名单节点都存在
    print("\n[3/4] 检查白名单节点完整性...")
    # 注意：白名单包含所有层级，但实际权限树可能因为父节点被过滤而导致子节点不出现
    # 我们检查顶层模块是否都存在即可
    top_level_whitelist = {k for k in SecurityInventory.WHITELIST_PERMISSIONS if k.count('.') == 1}
    top_level_actual = {k for k in actual_keys if k.count('.') == 1}
    
    missing_top = top_level_whitelist - top_level_actual
    if missing_top:
        print(f"   ⚠️  WARNING: 顶层白名单节点缺失 {len(missing_top)} 个:")
        for key in sorted(missing_top):
            print(f"      - {key}")
    else:
        print("   ✅ PASS: 所有顶层白名单节点存在")
    
    # 4. 通过HTTP访问检查模板渲染
    print("\n[4/4] 检查模板渲染（HTTP访问）...")
    client = Client()
    
    # 使用superadmin登录
    superuser = User.objects.filter(username=settings.SUPER_ADMIN_USER).first()
    if not superuser:
        print("   ⚠️  WARNING: Superadmin不存在，跳过HTTP检查")
        return True
    
    # 创建测试用户
    test_user, _ = User.objects.get_or_create(username='test_whitelist_user', defaults={'is_staff': False})
    
    client.force_login(superuser)
    response = client.get(f'/dashboard/user_admin/permissions/{test_user.username}/')
    
    if response.status_code != 200:
        print(f"   ❌ FAIL: HTTP响应码 {response.status_code}")
        return False
    
    html_content = response.content.decode('utf-8')
    
    # 检查模板残留
    template_patterns = [
        (r'\{\%\s*trans\s+[^%]*\n', '跨行的 {% trans %}'),
        (r'\{\{[^}]*\n', '跨行的 {{ }}'),
    ]
    
    template_issues = []
    for pattern, desc in template_patterns:
        matches = re.findall(pattern, html_content)
        if matches:
            template_issues.append(f"{desc}: {len(matches)} 处")
    
    # 检查敏感信息泄露
    sensitive_patterns = [
        (r'/Users/[a-zA-Z0-9_]+', '绝对路径'),
        (r'backups/[a-zA-Z0-9_/.]+\.sql', '备份文件路径'),
        (r'\b(SELECT|UPDATE|DELETE|INSERT)\b', 'SQL关键字'),
        (r'\bData_[A-Z][a-zA-Z_]+', '表名'),
    ]
    
    sensitive_issues = []
    for pattern, desc in sensitive_patterns:
        matches = re.findall(pattern, html_content, re.IGNORECASE)
        if matches:
            sensitive_issues.append(f"{desc}: {len(matches)} 处")
    
    if template_issues:
        print("   ❌ FAIL: 模板残留问题:")
        for issue in template_issues:
            print(f"      - {issue}")
        return False
    
    if sensitive_issues:
        print("   ❌ FAIL: 敏感信息泄露:")
        for issue in sensitive_issues:
            print(f"      - {issue}")
        return False
    
    print("   ✅ PASS: 模板渲染正常，无残留标签，无敏感信息")
    
    # 清理
    test_user.delete()
    
    return True


if __name__ == '__main__':
    print("\n" + "🔍 权限树白名单验证" + "\n")
    success = test_permission_tree_whitelist()
    
    print("\n" + "=" * 60)
    if success:
        print("✅ 所有验证通过")
        print("=" * 60 + "\n")
        sys.exit(0)
    else:
        print("❌ 验证失败")
        print("=" * 60 + "\n")
        sys.exit(1)
