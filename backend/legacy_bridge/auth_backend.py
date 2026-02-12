# File Path: backend/legacy_bridge/auth_backend.py
"""
文件说明: 遗留系统认证桥接器 (Legacy Auth Bridge)
核心原理:
1. 覆盖 Django 默认认证: 实现 `authenticate` 和 `get_user` 方法。
2. 数据源映射: 使用 `LegacyUser` (指向 User_Account 表) 查找用户。
3. 密码校验: 复用 `core.components.security.SecurityUtils` 中的 PBKDF2 逻辑，确保与 Streamlit 登录逻辑完全一致。
4. 权限映射: 将 `is_admin` 映射为 Django 的 `is_staff` 和 `is_superuser`，允许登录 Admin 后台。
"""

from django.contrib.auth.backends import BaseBackend
from django.contrib.auth.models import User as DjangoUser
from .models import LegacyUser

# 直接复用核心层的安全组件，确保算法一致
from backend.core.components.security import SecurityUtils


class LegacyAuthBackend(BaseBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        try:
            # 1. 在旧表中查找用户
            legacy_user = LegacyUser.objects.get(username=username)

            # 2. 检查锁定状态
            if legacy_user.is_locked:
                # 存储锁定状态到 request，供 login_view 显示提示
                if request:
                    request._user_locked = True
                return None

            # 3. 校验密码 (使用现有的加密逻辑)
            # 格式: pbkdf2_sha256$iterations$salt$hash
            if SecurityUtils.verify_password(password, legacy_user.password_hash):
                # 4. 密码正确 -> 获取或创建对应的 Django User (影子用户)
                # Django 的 Session 需要依赖 django_user 表，所以我们做一个即时同步
                user, created = DjangoUser.objects.get_or_create(username=legacy_user.username)

                # 同步权限状态
                from backend.common.settings import settings
                if legacy_user.is_admin:
                    user.is_staff = True
                    # Only the designated super admin gets is_superuser status
                    user.is_superuser = (legacy_user.username == settings.SUPER_ADMIN_USER)
                else:
                    user.is_staff = False
                    user.is_superuser = False

                user.save()
                
                # 5. [单点登录] 刷新 session token，使其他地方的登录失效
                from backend.core.services.auth.service import AuthService
                new_token = AuthService.refresh_session_token(username)
                # 存储 token 到 request 供 login_view 使用
                if request:
                    request._new_auth_token = new_token
                
                return user

        except LegacyUser.DoesNotExist:
            return None
        except Exception as e:
            print(f"Auth Backend Error: {e}")
            return None

    def get_user(self, user_id):
        try:
            return DjangoUser.objects.get(pk=user_id)
        except DjangoUser.DoesNotExist:
            return None