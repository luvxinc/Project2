# File: backend/apps/user_admin/utils.py
import json
import os
from pathlib import Path
from backend.common.settings import settings

# [Fix] Use settings.DATA_DIR directly for consistency with UserAdminService
# Previously used: Path(settings.BASE_DIR).parent / 'data' which was WRONG
SECURITY_OVERRIDES_PATH = settings.DATA_DIR / 'security_overrides.json'
ADMIN_CAPABILITIES_PATH = settings.DATA_DIR / 'admin_capabilities.json'

class PasswordPolicyValidator:
    """
    Validates whether an action requires a password check based on `security_overrides.json`.
    """
    _policy_cache = None

    @classmethod
    def load_policy(cls):
        """Reloads the policy from JSON."""
        try:
            with open(SECURITY_OVERRIDES_PATH, 'r', encoding='utf-8') as f:
                cls._policy_cache = json.load(f)
        except Exception as e:
            print(f"Error loading security_overrides.json: {e}")
            cls._policy_cache = {}
        return cls._policy_cache

    @classmethod
    def reset_cache(cls):
        """[New] Force reload policy cache."""
        cls._policy_cache = None
        cls.load_policy()

    @classmethod
    def requires_password(cls, action_key):
        """
        Checks if the given action_key requires password verification.
        Returns True if the list of tokens in JSON is non-empty.
        """
        if cls._policy_cache is None:
            cls.load_policy()
        
        # If key exists and list is not empty, password is required.
        tokens = cls._policy_cache.get(action_key, [])
        return bool(tokens)

    @staticmethod
    def verify_password(user, password):
        """
        Verifies the user's password.
        Special case: If checking environment variable master password (optional).
        For now, strictly checks Django User password.
        """
        if not user or not user.is_authenticated:
            return False
        return user.check_password(password)

class CapabilityManager:
    """
    Manages admin capabilities based on `admin_capabilities.json`.
    [Fix] 基于 mtime 的缓存自动失效，确保文件变化后立刻生效。
    """
    _caps_cache: dict = None
    _caps_mtime: float = 0

    @classmethod
    def load_caps(cls):
        """从文件读取并更新缓存和 mtime"""
        try:
            if ADMIN_CAPABILITIES_PATH.exists():
                cls._caps_mtime = ADMIN_CAPABILITIES_PATH.stat().st_mtime
                with open(ADMIN_CAPABILITIES_PATH, 'r', encoding='utf-8') as f:
                    cls._caps_cache = json.load(f)
            else:
                cls._caps_cache = {}
                cls._caps_mtime = 0
        except Exception:
            cls._caps_cache = {}
            cls._caps_mtime = 0
        return cls._caps_cache

    @classmethod
    def reset_cache(cls):
        """手动清空缓存（保留兼容，但 mtime 机制会自动处理）"""
        cls._caps_cache = None
        cls._caps_mtime = 0

    @classmethod
    def _ensure_fresh_cache(cls):
        """检查 mtime，若文件变化则重新加载"""
        try:
            if ADMIN_CAPABILITIES_PATH.exists():
                current_mtime = ADMIN_CAPABILITIES_PATH.stat().st_mtime
                if cls._caps_cache is None or current_mtime != cls._caps_mtime:
                    cls.load_caps()
            elif cls._caps_cache is None:
                cls._caps_cache = {}
        except Exception:
            if cls._caps_cache is None:
                cls._caps_cache = {}

    @classmethod
    def check_capability(cls, user, capability_key):
        """
        检查用户是否具有指定能力。
        - Superuser: 始终返回 True
        - Admin (is_staff): 从 JSON 读取
        - User: 始终返回 False
        """
        if not user.is_authenticated:
            return False
        
        if user.is_superuser:
            return True
        
        if not user.is_staff:
            return False

        # Admin: 检查 mtime 确保缓存最新
        cls._ensure_fresh_cache()
        return cls._caps_cache.get(capability_key, False)

class RoleManager:
    """
    Utilities for role management interactions.
    """
    @staticmethod
    def can_manage_target(actor, target_user):
        """
        Hierarchy: SuperAdmin > Admin > User.
        actor cannot manage someone with equal or higher role.
        """
        actor_level = RoleManager.get_role_level(actor)
        target_level = RoleManager.get_role_level(target_user)
        
        return actor_level > target_level

    @staticmethod
    def get_role_level(user):
        if user.is_superuser:
            return 3
        if user.is_staff:
            return 2
        return 1
