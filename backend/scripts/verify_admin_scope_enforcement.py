#!/usr/bin/env python3
"""
验收脚本：Admin作用域限制验证
- 验证admin只能赋予自己拥有的权限
- 验证backend拒绝admin越权提交
"""
import os
import sys

# Add backend directory to path
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'django_config.settings')
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from backend.core.services.auth.service import AuthService

User = get_user_model()

def test_admin_scope_enforcement():
    """测试admin作用域限制"""
    print("\n" + "=" * 60)
    print("Admin作用域限制验证")
    print("=" * 60)
    
    # 创建测试用户
    admin_user, _ = User.objects.get_or_create(
        username='test_admin_scope_admin',
        defaults={'is_staff': True, 'is_superuser': False}
    )
    target_user, _ = User.objects.get_or_create(
        username='test_admin_scope_target',
        defaults={'is_staff': False, 'is_superuser': False}
    )
    
    # 给admin用户设置部分权限（仅销售板块）
    admin_perms = [
        'module.sales',
        'module.sales.transactions',
        'module.sales.transactions.upload',
    ]
    AuthService.set_permissions(admin_user.username, admin_perms)
    
    # 给目标用户设置初始权限（空）
    AuthService.set_permissions(target_user.username, [])
    
    client = Client()
    client.force_login(admin_user)
    
    # Test 1: admin提交自己拥有的权限（允许）
    print("\n[1/3] 测试admin提交自己拥有的权限...")
    response = client.post(
        f'/dashboard/user_admin/actions/update_permissions/{target_user.username}/',
        data={
            'perms': ['module.sales.transactions.upload'],
            'sec_code_user': 'test123',  # 假设的密码
        }
    )
    
    if response.status_code in [200, 302]:
        print("   ✅ PASS: 允许保存（符合预期）")
    else:
        print(f"   ❌ FAIL: 意外状态码 {response.status_code}")
        return False
    
    # Test 2: admin提交不拥有的权限（拒绝）
    print("\n[2/3] 测试admin提交越权权限...")
    response = client.post(
        f'/dashboard/user_admin/actions/update_permissions/{target_user.username}/',
        data={
            'perms': ['module.purchase.supplier.add'],  # admin没有这个权限
            'sec_code_user': 'test123',
        }
    )
    
    if response.status_code == 403:
        print("   ✅ PASS: 后端拒绝（403）")
    else:
        print(f"   ❌ FAIL: 应返回403但得到 {response.status_code}")
        return False
    
    # Test 3: 验证目标用户权限未被越权修改
    print("\n[3/3] 验证目标用户权限未被篡改...")
    target_perms = AuthService.get_permissions(target_user.username)
    if 'module.purchase.supplier.add' in target_perms:
        print("   ❌ FAIL: 越权权限被写入")
        return False
    else:
        print("   ✅ PASS: 目标用户权限未被篡改")
    
    # 清理
    admin_user.delete()
    target_user.delete()
    
    return True


if __name__ == '__main__':
    print("\n" + "🔍 Admin作用域限制验证" + "\n")
    success = test_admin_scope_enforcement()
    
    print("\n" + "=" * 60)
    if success:
        print("✅ 所有验证通过")
        print("=" * 60 + "\n")
        sys.exit(0)
    else:
        print("❌ 验证失败")
        print("=" * 60 + "\n")
        sys.exit(1)
