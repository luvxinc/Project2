#!/usr/bin/env python3
"""
P0缺陷验收脚本：权限保存立即生效+单点赋权不扩散
"""
import sys
import os

# Setup path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Run via manage.py shell
test_code = '''
from django.contrib.auth import get_user_model
from core.services.auth.service import AuthService

User = get_user_model()

print("=" * 70)
print("P0缺陷验收：权限保存立即生效+单点赋权不扩散")
print("=" * 70)

# 准备测试用户
test_user, _ = User.objects.get_or_create(
    username="test_p0_fix",
    defaults={"is_staff": False, "is_superuser": False}
)

passed = 0
failed = []

# 测试1: 单点赋权不扩散
print("\\n[测试1] 单点赋权不扩散")
print("-" * 70)

single_key = "module.db_admin.backup.create"
AuthService.set_permissions(test_user.username, [single_key])

# 读回raw permissions（不含推导）
raw_perms = AuthService.get_raw_permissions(test_user.username)
print(f"授予权限: {single_key}")
print(f"存储数量: {len(raw_perms)} 个")
print(f"存储keys: {list(raw_perms.keys())}")

if len(raw_perms) == 1 and single_key in raw_perms:
    print("✅ PASS: 单点赋权不扩散")
    passed += 1
else:
    print(f"❌ FAIL: 期望1个但存储了{len(raw_perms)}个")
    failed.append("单点赋权扩散")

# 测试2: 保存后刷新可见（读回权限）
print("\\n[测试2] 保存后读回正确")
print("-" * 70)

# 读回full permissions（含推导，用于view校验）
full_perms = AuthService.get_permissions(test_user.username)
print(f"完整权限数量: {len(full_perms)} 个（含推导父级）")
print(f"Raw权限数量: {len(raw_perms)} 个（不含推导）")

# Raw应该只有1个
if len(raw_perms) == 1:
    print("✅ PASS: Raw权限数量正确")
    passed += 1
else:
    print(f"❌ FAIL: Raw权限数量错误")
    failed.append("读回权限数量错")

# Full应该包含推导的父级
expected_inferred = ["module.db_admin", "module.db_admin.backup"]
has_inferred = all(k in full_perms for k in expected_inferred)
if has_inferred:
    print("✅ PASS: 父级权限正确推导（用于view校验）")
    passed += 1
else:
    print(f"❌ FAIL: 父级权限推导失败")
    failed.append("父级推导失败")

# 测试3: Revoke后立即生效
print("\\n[测试3] Revoke后立即生效")
print("-" * 70)

AuthService.set_permissions(test_user.username, [])
raw_after_revoke = AuthService.get_raw_permissions(test_user.username)
print(f"Revoke后权限数量: {len(raw_after_revoke)} 个")

if len(raw_after_revoke) == 0:
    print("✅ PASS: Revoke立即生效")
    passed += 1
else:
    print(f"❌ FAIL: Revoke后仍有{len(raw_after_revoke)}个权限")
    failed.append("Revoke未生效")

# 测试4: Re-grant后立即生效
print("\\n[测试4] Re-grant后立即生效")
print("-" * 70)

AuthService.set_permissions(test_user.username, [single_key])
raw_after_regrant = AuthService.get_raw_permissions(test_user.username)
print(f"Re-grant后权限数量: {len(raw_after_regrant)} 个")

if len(raw_after_regrant) == 1 and single_key in raw_after_regrant:
    print("✅ PASS: Re-grant立即生效")
    passed += 1
else:
    print(f"❌ FAIL: Re-grant失败")
    failed.append("Re-grant失败")

# 清理
test_user.delete()

# 汇总
print("\\n" + "=" * 70)
print("验收汇总")
print("=" * 70)
print(f"通过: {passed}/5")
print(f"失败: {len(failed)}")

if failed:
    print("\\n失败项:")
    for f in failed:
        print(f"  - {f}")
    print("\\n❌ 验收未通过")
else:
    print("\\n✅ ALL CHECKS PASSED")
'''

# Execute via manage.py shell
import subprocess
result = subprocess.run(
    ['python3', 'manage.py', 'shell', '-c', test_code],
    capture_output=True,
    text=True
)

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr, file=sys.stderr)

sys.exit(result.returncode)
