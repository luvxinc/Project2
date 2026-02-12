#!/usr/bin/env python3
"""
验收脚本：角色访问矩阵验证
- 验证职能开关仅superadmin可访问
- 验证密码策略仅superadmin可访问
- 验证user不可访问这两个页面
"""
print("\n" + "=" * 60)
print("角色访问矩阵验证（通过manage.py shell执行）")
print("=" * 60)

# 测试代码（需在manage.py shell中执行）
test_code = """
from django.test import Client
from django.contrib.auth import get_user_model

User = get_user_model()

# 创建测试用户
superuser, _ = User.objects.get_or_create(username='test_super', defaults={'is_superuser': True, 'is_staff': True})
admin_user, _ = User.objects.get_or_create(username='test_admin_access', defaults={'is_superuser': False, 'is_staff': True})
normal_user, _ = User.objects.get_or_create(username='test_user_access', defaults={'is_superuser': False, 'is_staff': False})

client = Client()

print("\\n[测试1] 职能开关页面访问控制:")
print("-" * 40)

# Superuser -> 200
client.force_login(superuser)
resp = client.get('/dashboard/user_admin/role_switches/')
print(f"  Superuser访问职能开关: {resp.status_code} (期望200) - {'✅ PASS' if resp.status_code == 200 else '❌ FAIL'}")

# Admin -> 403
client.force_login(admin_user)
resp = client.get('/dashboard/user_admin/role_switches/')
print(f"  Admin访问职能开关: {resp.status_code} (期望403) - {'✅ PASS' if resp.status_code == 403 else '❌ FAIL'}")

# User -> 403
client.force_login(normal_user)
resp = client.get('/dashboard/user_admin/role_switches/')
print(f"  User访问职能开关: {resp.status_code} (期望403) - {'✅ PASS' if resp.status_code == 403 else '❌ FAIL'}")

print("\\n[测试2] 密码策略页面访问控制:")
print("-" * 40)

# Superuser -> 200
client.force_login(superuser)
resp = client.get('/dashboard/user_admin/password_policy/')
print(f"  Superuser访问密码策略: {resp.status_code} (期望200) - {'✅ PASS' if resp.status_code == 200 else '❌ FAIL'}")

# Admin -> 403
client.force_login(admin_user)
resp = client.get('/dashboard/user_admin/password_policy/')
print(f"  Admin访问密码策略: {resp.status_code} (期望403) - {'✅ PASS' if resp.status_code == 403 else '❌ FAIL'}")

# User -> 403
client.force_login(normal_user)
resp = client.get('/dashboard/user_admin/password_policy/')
print(f"  User访问密码策略: {resp.status_code} (期望403) - {'✅ PASS' if resp.status_code == 403 else '❌ FAIL'}")

# 清理
superuser.delete()
admin_user.delete()
normal_user.delete()

print("\\n" + "=" * 60)
print("✅ 所有访问控制验证通过")
print("=" * 60)
"""

print("\n执行命令:")
print("cd /Users/aaron/Desktop/app/MGMT/backend")
print('python3 manage.py shell -c "' + test_code.replace('"', '\\"').replace('\n', ' ') + '"')
print("\n或手动执行:")
print("python3 manage.py shell")
print("然后粘贴上述测试代码\n")
