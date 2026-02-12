#!/usr/bin/env python3
"""
端到端权限验收脚本：Evidence A/B/C驱动
验证P0-1（保存后刷新）和P0-2（单点不扩权）
"""
import os
import sys

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

test_code = '''
from django.test import Client
from django.contrib.auth import get_user_model
from core.services.auth.service import AuthService
from bs4 import BeautifulSoup
import re

User = get_user_model()

print("=" * 80)
print("P0缺陷端到端验收：Evidence A/B/C驱动")
print("=" * 80)

# 准备测试数据
TEST_USER = "test_e2e_perms"
PARENT_MODULE = "module.db_admin"
LEAF_KEY_1 = "module.db_admin.backup.create"  # 数据备份
LEAF_KEY_2 = "module.db_admin.backup.restore"  # 数据恢复

# 创建测试用户
test_user, _ = User.objects.get_or_create(
    username=TEST_USER,
    defaults={"is_staff": False, "is_superuser": False}
)

# 创建superuser用于操作
su, _ = User.objects.get_or_create(
    username="test_e2e_su",
    defaults={"is_staff": True, "is_superuser": True}
)

client = Client()
client.force_login(su)

print(f"\\n测试对象: {TEST_USER}")
print(f"父级模块: {PARENT_MODULE}")
print(f"子级Key1: {LEAF_KEY_1}")
print(f"子级Key2: {LEAF_KEY_2}")

# Case 1: 单点赋权不扩散（P0-2）
print("\\n" + "=" * 80)
print("Case 1: 单点赋权不扩散（P0-2）")
print("=" * 80)

# POST保存：只勾选LEAF_KEY_1
print("\\n[Action] POST保存: 只勾选1个叶子key...")
response = client.post(
    f"/dashboard/user_admin/actions/update_permissions/{TEST_USER}/",
    {"perms": [LEAF_KEY_1]},
    HTTP_HX_REQUEST="true"
)

print(f"POST Response Status: {response.status_code}")

# Evidence A: 通过后端日志查看（已在actions.py添加print）
print("\\n[Evidence A] Incoming keys (查看后端日志中的DEBUG perm-save)")

# Evidence B: 直接读DB
stored_raw = AuthService.get_raw_permissions(TEST_USER)
print(f"\\n[Evidence B] Stored in DB:")
print(f"  Count: {len(stored_raw)}")
print(f"  Keys: {sorted(stored_raw.keys())}")

if len(stored_raw) == 1 and LEAF_KEY_1 in stored_raw:
    print("  ✅ PASS: 单点赋权不扩散（DB层）")
else:
    print(f"  ❌ FAIL: 期望1个({LEAF_KEY_1})，实际{len(stored_raw)}个")

# Evidence C: GET页面，解析HTML中的checked checkboxes
print(f"\\n[Evidence C] GET页面渲染:")
response = client.get(
    f"/dashboard/user_admin/panel/permissions/{TEST_USER}/",
    HTTP_HX_REQUEST="true"
)

if response.status_code == 200:
    html = response.content.decode('utf-8')
    soup = BeautifulSoup(html, 'html.parser')
    
    # 查找所有name="perms"且checked的checkbox
    checked_checkboxes = soup.find_all('input', {'name': 'perms', 'checked': True})
    checked_keys = [cb.get('value') for cb in checked_checkboxes if cb.get('value')]
    
    print(f"  Checked count: {len(checked_keys)}")
    print(f"  Checked keys: {checked_keys[:20]}")
    
    if len(checked_keys) == 1 and LEAF_KEY_1 in checked_keys:
        print("  ✅ PASS: 页面渲染正确（HTML层）")
    else:
        print(f"  ❌ FAIL: 期望1个checked，实际{len(checked_keys)}个")
        if len(checked_keys) > 1:
            print(f"  扩散的keys: {[k for k in checked_keys if k != LEAF_KEY_1]}")
else:
    print(f"  ❌ FAIL: GET页面失败 status={response.status_code}")

# Case 2: 保存后刷新可见（P0-1）
print("\\n" + "=" * 80)
print("Case 2: 添加第2个key，验证刷新可见（P0-1）")
print("=" * 80)

print("\\n[Action] POST保存: 勾选2个叶子key...")
response = client.post(
    f"/dashboard/user_admin/actions/update_permissions/{TEST_USER}/",
    {"perms": [LEAF_KEY_1, LEAF_KEY_2]},
    HTTP_HX_REQUEST="true"
)

# Evidence B
stored_raw_2 = AuthService.get_raw_permissions(TEST_USER)
print(f"\\n[Evidence B] Stored in DB:")
print(f"  Count: {len(stored_raw_2)}")
print(f"  Keys: {sorted(stored_raw_2.keys())}")

# Evidence C
response = client.get(
    f"/dashboard/user_admin/panel/permissions/{TEST_USER}/",
    HTTP_HX_REQUEST="true"
)

if response.status_code == 200:
    html = response.content.decode('utf-8')
    soup = BeautifulSoup(html, 'html.parser')
    
    checked_checkboxes = soup.find_all('input', {'name': 'perms', 'checked': True})
    checked_keys = [cb.get('value') for cb in checked_checkboxes if cb.get('value')]
    
    print(f"\\n[Evidence C] GET页面渲染:")
    print(f"  Checked count: {len(checked_keys)}")
    print(f"  Checked keys: {sorted(checked_keys)[:20]}")
    
    if len(checked_keys) == 2 and set(checked_keys) == {LEAF_KEY_1, LEAF_KEY_2}:
        print("  ✅ PASS: 刷新后新权限可见")
    else:
        print(f"  ❌ FAIL: 期望2个checked，实际{len(checked_keys)}个")

# Case 3: Revoke验证
print("\\n" + "=" * 80)
print("Case 3: Revoke全部权限")
print("=" * 80)

print("\\n[Action] POST保存: 空集合...")
response = client.post(
    f"/dashboard/user_admin/actions/update_permissions/{TEST_USER}/",
    {"perms": []},
    HTTP_HX_REQUEST="true"
)

stored_raw_3 = AuthService.get_raw_permissions(TEST_USER)
print(f"\\n[Evidence B] Stored in DB: {len(stored_raw_3)} keys")

response = client.get(
    f"/dashboard/user_admin/panel/permissions/{TEST_USER}/",
    HTTP_HX_REQUEST="true"
)

if response.status_code == 200:
    html = response.content.decode('utf-8')
    soup = BeautifulSoup(html, 'html.parser')
    
    checked_checkboxes = soup.find_all('input', {'name': 'perms', 'checked': True})
    checked_keys = [cb.get('value') for cb in checked_checkboxes if cb.get('value')]
    
    print(f"[Evidence C] GET页面渲染: {len(checked_keys)} checked")
    
    if len(checked_keys) == 0:
        print("  ✅ PASS: Revoke后页面清空")
    else:
        print(f"  ❌ FAIL: 期望0个checked，实际{len(checked_keys)}个")
        print(f"  残留keys: {checked_keys}")

# 清理
test_user.delete()
su.delete()

print("\\n" + "=" * 80)
print("验收完成")
print("=" * 80)
'''

import subprocess
result = subprocess.run(
    ['python3', 'manage.py', 'shell', '-c', test_code],
    capture_output=True,
    text=True,
    cwd='/Users/aaron/Desktop/app/MGMT/backend'
)

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr, file=sys.stderr)

sys.exit(result.returncode)
