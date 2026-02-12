#!/usr/bin/env python3
"""
绕过HTTP层的直接权限测试：Evidence A/B/C驱动
专注测试权限存储和页面渲染逻辑
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

test_code = '''
from django.test import Client
from django.contrib.auth import get_user_model
from core.services.auth.service import AuthService
from bs4 import BeautifulSoup

User = get_user_model()

print("=" * 80)
print("P0缺陷验收：直接API测试（绕过HTTP Security Gate）")
print("=" * 80)

TEST_USER = "test_direct_api"
LEAF_KEY_1 = "module.db_admin.backup.create"
LEAF_KEY_2 = "module.db_admin.backup.restore"

# 准备测试用户
test_user, _ = User.objects.get_or_create(username=TEST_USER, defaults={"is_staff": False})
su, _ = User.objects.get_or_create(username="test_su_api", defaults={"is_superuser": True})

# Case 1: 单点赋权不扩散
print("\\n" + "="*80)
print("Case 1: 单点赋权不扩散（P0-2）")
print("="*80)

# [Evidence A] 模拟incoming
incoming_keys = [LEAF_KEY_1]
print(f"\\n[Evidence A] Incoming keys:")
print(f"  Count: {len(incoming_keys)}")
print(f"  Keys: {incoming_keys}")

# 直接调用set_permissions（模拟保存接口）
AuthService.set_permissions(TEST_USER, incoming_keys)

# [Evidence B] 读回DB
stored_raw = AuthService.get_raw_permissions(TEST_USER)
print(f"\\n[Evidence B] Stored in DB (raw, no inference):")
print(f"  Count: {len(stored_raw)}")
print(f"  Keys: {sorted(stored_raw.keys())}")

if len(stored_raw) == 1 and LEAF_KEY_1 in stored_raw:
    print("  ✅ PASS: 单点赋权不扩散（DB层）")
else:
    print(f"  ❌ FAIL: 期望1个，实际{len(stored_raw)}个")

# 检查推导版本（用于view校验）
stored_full = AuthService.get_permissions(TEST_USER)
print(f"\\n[Check] Stored with inference (for view checks):")
print(f"  Count: {len(stored_full)}")
print(f"  Keys: {sorted(stored_full.keys())}")

# [Evidence C] GET页面HTML渲染
print(f"\\n[Evidence C] GET页面渲染:")
client = Client()
client.force_login(su)

response = client.get(f"/dashboard/user_admin/panel/permissions/{TEST_USER}/", HTTP_HX_REQUEST="true")

if response.status_code == 200:
    html = response.content.decode('utf-8')
    soup = BeautifulSoup(html, 'html.parser')
    
    # 查找所有name="perms"的checked checkbox
    all_perms_cb = soup.find_all('input', {'name': 'perms'})
    checked_cb = [cb for cb in all_perms_cb if cb.has_attr('checked')]
    checked_keys = [cb.get('value') for cb in checked_cb if cb.get('value')]
    
    print(f"  Total perms checkboxes: {len(all_perms_cb)}")
    print(f"  Checked count: {len(checked_keys)}")
    print(f"  Checked keys: {sorted(checked_keys)[:20]}")
    
    if len(checked_keys) == 1 and LEAF_KEY_1 in checked_keys:
        print("  ✅ PASS: 页面渲染正确（单个checked）")
    else:
        print(f"  ❌ FAIL: 期望1个checked，实际{len(checked_keys)}个")
        if len(checked_keys) > 1:
            extra_keys = [k for k in checked_keys if k != LEAF_KEY_1]
            print(f"  ⚠️  扩散的keys: {extra_keys}")
            
            # 分析扩散原因
            if any("module.db_admin.backup" in k for k in extra_keys):
                print("  ⚠️  根因分析: 同submodule下其他tabs被勾选")
            if any(k.startswith("module.db_admin") and len(k.split('.')) < 4 for k in extra_keys):
                print("  ⚠️  根因分析: 父级/中间级key被勾选")
else:
    print(f"  ❌ FAIL: GET失败 status={response.status_code}")

# Case 2: 保存2个key后刷新
print("\\n" + "="*80)
print("Case 2: 保存2个key，验证刷新可见")
print("="*80)

incoming_keys_2 = [LEAF_KEY_1, LEAF_KEY_2]
print(f"\\n[Evidence A] Incoming: {len(incoming_keys_2)} keys")

AuthService.set_permissions(TEST_USER, incoming_keys_2)

stored_raw_2 = AuthService.get_raw_permissions(TEST_USER)
print(f"[Evidence B] Stored: {len(stored_raw_2)} keys - {sorted(stored_raw_2.keys())}")

response = client.get(f"/dashboard/user_admin/panel/permissions/{TEST_USER}/", HTTP_HX_REQUEST="true")
if response.status_code == 200:
    soup = BeautifulSoup(response.content.decode('utf-8'), 'html.parser')
    checked_cb = soup.find_all('input', {'name': 'perms', 'checked': True})
    checked_keys = [cb.get('value') for cb in checked_cb if cb.get('value')]
    
    print(f"[Evidence C] Checked: {len(checked_keys)} keys - {sorted(checked_keys)[:10]}")
    
    if len(checked_keys) == 2 and set(checked_keys) == set(incoming_keys_2):
        print("  ✅ PASS: 刷新后2个key可见")
    else:
        print(f"  ❌ FAIL: 期望2个，实际{len(checked_keys)}个")

# Case 3: Revoke
print("\\n" + "="*80)
print("Case 3: Revoke全部")
print("="*80)

AuthService.set_permissions(TEST_USER, [])
stored_raw_3 = AuthService.get_raw_permissions(TEST_USER)
print(f"[Evidence B] Stored: {len(stored_raw_3)} keys")

response = client.get(f"/dashboard/user_admin/panel/permissions/{TEST_USER}/", HTTP_HX_REQUEST="true")
if response.status_code == 200:
    soup = BeautifulSoup(response.content.decode('utf-8'), 'html.parser')
    checked_cb = soup.find_all('input', {'name': 'perms', 'checked': True})
    checked_keys = [cb.get('value') for cb in checked_cb if cb.get('value')]
    
    print(f"[Evidence C] Checked: {len(checked_keys)} keys")
    
    if len(checked_keys) == 0:
        print("  ✅ PASS: Revoke后页面清空")
    else:
        print(f"  ❌ FAIL: 期望0个，实际{len(checked_keys)}个")
        print(f"  残留keys: {checked_keys}")

# 清理
test_user.delete()
su.delete()

print("\\n" + "="*80)
print("验收完成")
print("="*80)
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
