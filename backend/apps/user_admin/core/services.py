# File: backend/apps/user_admin/core/services.py
"""
# ==============================================================================
# 模块名称: 用户管理服务 (User Admin Service)
# ==============================================================================
#
# [Purpose / 用途]
# 封装用户管理的业务逻辑 (CRUD, Lock, Password Reset)。
# 继承自 BaseService，确保审计追踪 (Trace ID) 和日志规范。
#
# [Architecture / 架构]
# - Layer: Domain Service
# - Parent: BaseService
# - Dependency: AuthService
#
# ==============================================================================
"""

import logging
from typing import List, Dict, Any, Tuple, Optional
from django.contrib.auth import get_user_model
from django.db import transaction

from backend.common.settings import settings
from backend.core.services.base import BaseService
from backend.core.services.auth.service import AuthService
from backend.core.components.db.client import DBClient
from backend.apps.audit.core.context import AuditContext
from backend.core.sys.logger import get_logger
from .utils import ConfigFileHandler

logger = get_logger("UserAdminService")

User = get_user_model()


class UserAdminService(BaseService):
    # -------------------------------------------------------------------------
    # [Fix] 补全缺失的路径常量，供 View 层 (actions.py) 调用
    # -------------------------------------------------------------------------
    POLICY_FILE = settings.DATA_DIR / "security_overrides.json"
    CAPABILITIES_FILE = settings.DATA_DIR / "admin_capabilities.json"

    def __init__(self):
        super().__init__()
        # 业务逻辑依然依赖 AuthService 处理底层操作
        self.auth_service = AuthService()

    def get_user_details(self, user_id: int) -> Optional[Dict]:
        """获取用户详情"""
        try:
            user = User.objects.get(pk=user_id)
            return {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "is_active": user.is_active,
                "last_login": user.last_login,
                # 可以在此扩展更多字段
            }
        except User.DoesNotExist:
            self.log(f"User ID {user_id} not found", level="warning")
            return None

    # =========================================================================
    # 1. 用户管理 (User Management)
    # =========================================================================

    @staticmethod
    def get_enhanced_user_list(actor=None) -> List[Dict]:
        """
        获取增强版用户列表 (用于 UI 展示)
        :param actor: 当前操作用户 (User Object)，用于计算针对每一行的操作权限 (can_edit, etc.)
        """
        # 1. 获取基础用户表
        df = AuthService.list_users()
        if df.empty: return []

        # 2. 获取最近登录时间
        login_map = {}
        try:
            sql = "SELECT username, MAX(login_at) as last_login FROM User_Login_History GROUP BY username"
            df_login = DBClient.read_df(sql)
            if not df_login.empty:
                df_login['last_login'] = df_login['last_login'].astype(str)
                login_map = dict(zip(df_login['username'], df_login['last_login']))
        except Exception as e:
            logger.error(f"Error fetching login history: {e}")

        # 3. 预加载权限所需数据
        actor_level = 0
        caps = {}
        if actor:
            if actor.is_superuser: actor_level = 3
            elif actor.is_staff: actor_level = 2
            else: actor_level = 1
            
            # 仅 SuperUser 或 Admin 才需加载开关
            if actor_level > 1:
                # 避免循环导入，使用类方法
                caps = UserAdminService.get_capabilities()
        
        users = []
        df = df.fillna(0)

        for _, row in df.iterrows():
            username = row['username']
            is_admin = bool(row.get('is_admin', False))
            is_locked = bool(row.get('is_locked', False))

            # 角色判定 & Row Level
            row_level = 1
            if username == settings.SUPER_ADMIN_USER:
                role_label = "Super Admin"
                role_class = "text-warning fw-bold border-warning"
                is_protected = True
                role_weight = 0
                row_level = 3
            elif is_admin:
                role_label = "Admin"
                role_class = "text-info border-info"
                is_protected = False
                role_weight = 1
                row_level = 2
            else:
                role_label = "User"
                role_class = "text-secondary border-secondary"
                is_protected = False
                role_weight = 2
                row_level = 1

            # 格式化时间
            last_login_raw = login_map.get(username, "-")
            if last_login_raw != "-" and len(last_login_raw) > 16:
                last_login = last_login_raw[:16]
            else:
                last_login = "Never"
            
            # --- 权限计算 (Frontend Grey-out Logic) ---
            # is_self: 当前用户是否在看自己的行
            is_self = actor and actor.username == username
            
            perms = {
                "can_lock": False,
                "can_delete": False,
                "can_reset": False,       # Reset others' password
                "can_reset_self": is_self, # Reset own password (always allowed for self)
                "can_manage_perms": False, # [New] Manage user module perms
                "can_promote": False,
                "can_demote": False,
                "is_self": is_self,
            }
            
            if actor:
                # 核心规则: 只有上级能管理下级 (Strict >)
                is_manageable = actor_level > row_level
                
                # 如果是 Super Admin (Level 3), 拥有所有能力
                if actor_level == 3:
                     if is_manageable:
                         perms["can_lock"] = True
                         perms["can_delete"] = True
                         perms["can_reset"] = True
                         perms["can_manage_perms"] = True
                         perms["can_promote"] = True
                         perms["can_demote"] = True
                
                # 如果是 Admin (Level 2)
                elif actor_level == 2:
                    if is_manageable: 
                        # 必须结合 Capability Switch
                        perms["can_lock"] = caps.get("can_lock_user", False)
                        perms["can_delete"] = caps.get("can_delete_user", False)
                        perms["can_reset"] = caps.get("can_reset_pwd", False)
                        perms["can_manage_perms"] = caps.get("can_manage_perms", False)
                        perms["can_promote"] = caps.get("can_change_role", False)
                        perms["can_demote"] = caps.get("can_change_role", False)
                        
            user_data = {
                "username": username,
                "is_admin": is_admin,
                "is_locked": is_locked,
                "failed_attempts": int(row.get('failed_attempts', 0)),
                "role_label": role_label,
                "role_class": role_class,
                "role_weight": role_weight,
                "is_protected": is_protected,
                "last_login": last_login,
                "row_id": f"user_row_{username}",
                # Inject Perms
                **perms
            }
            users.append(user_data)

        users.sort(key=lambda x: (x['role_weight'], x['username']))
        return users

    # =========================================================================
    # 2. 策略管理 (Security Policies)
    # =========================================================================

    @classmethod
    def get_policy_matrix(cls) -> Dict[str, Any]:
        """生成策略矩阵 - 按子模块分组"""
        registry = settings.load_action_registry()
        modules = registry.get("modules", [])

        # [Fix] 使用类常量读取
        overrides = ConfigFileHandler.load_json(cls.POLICY_FILE)

        matrix = []
        for mod in modules:
            mod_data = {
                "name": mod["name"],
                "key": mod["key"],
                "submodules": []  # Changed from "actions" to grouped structure
            }
            
            # Process submodules
            for sub in mod.get("submodules", []):
                sub_data = {
                    "name": sub["name"],
                    "key": sub["key"],
                    "actions": []
                }
                
                for tab in sub.get("tabs", []):
                    for act in tab.get("actions", []):
                        act_key = act["key"]
                        current_tokens = overrides.get(act_key, act.get("default_security", []))

                        sub_data["actions"].append({
                            "key": act_key,
                            "name": act.get("displayName", act["name"]),
                            "desc": act.get("description", ""),
                            "tab_name": tab["name"],
                            "tokens": current_tokens,
                            "default_tokens": act.get("default_security", [])
                        })
                
                if sub_data["actions"]:
                    mod_data["submodules"].append(sub_data)
            
            # Handle top-level tabs (if any module has direct tabs)
            top_tabs = mod.get("tabs", [])
            if top_tabs:
                top_sub = {
                    "name": "通用",
                    "key": "_general",
                    "actions": []
                }
                for tab in top_tabs:
                    for act in tab.get("actions", []):
                        act_key = act["key"]
                        current_tokens = overrides.get(act_key, act.get("default_security", []))

                        top_sub["actions"].append({
                            "key": act_key,
                            "name": act.get("displayName", act["name"]),
                            "desc": act.get("description", ""),
                            "tab_name": tab["name"],
                            "tokens": current_tokens,
                            "default_tokens": act.get("default_security", [])
                        })
                if top_sub["actions"]:
                    mod_data["submodules"].insert(0, top_sub)
            
            if mod_data["submodules"]:
                matrix.append(mod_data)

        return {"modules": matrix}
    
    @classmethod
    def update_all_policies(cls, policy_map: Dict[str, List[str]], operator: str) -> Tuple[bool, str]:
        """批量更新所有策略"""
        file_path = cls.POLICY_FILE

        try:
            current_config = ConfigFileHandler.load_json(file_path)
            
            # Calculate changes
            changes = {}
            for k, v in policy_map.items():
                old_val = current_config.get(k, [])
                if sorted(old_val) != sorted(v):
                    changes[k] = {"old": old_val, "new": v}
            
            if not changes:
                return True, "无变更"
            
            # Merge with existing (preserve keys not in policy_map)
            new_config = {**current_config, **policy_map}
            
            backup_ref = ConfigFileHandler.save_json_with_backup(
                file_path, new_config, operator, "Batch Update Policies"
            )

            logger.warning(f"策略批量变更 | 变更项: {len(changes)} | Backup: {backup_ref}", extra={
                "action": "BATCH_UPDATE_POLICY",
                "user": operator,
                "target_model": "SecurityPolicy",
                "target_id": "ALL",
                "changes": changes,
                "status": "Success",
                "note": f"Updated {len(changes)} policies",
                "log_type": "Regular"
            })

            return True, f"已更新 {len(changes)} 项策略"

        except Exception as e:
            logger.error(f"策略批量更新失败: {e}",
                               extra={"user": operator, "action": "BATCH_UPDATE_POLICY", "status": "Failed(System)",
                                      "log_type": "System"})
            return False, str(e)

    @classmethod
    def update_policy(cls, action_key: str, tokens: List[str], operator: str) -> Tuple[bool, str]:
        """更新策略 + 备份 + 审计"""
        if action_key == "btn_login" and "user" not in tokens:
            return False, "Login action must require 'user' token."

        file_path = cls.POLICY_FILE

        try:
            current_config = ConfigFileHandler.load_json(file_path)
            old_tokens = current_config.get(action_key, [])

            if sorted(old_tokens) == sorted(tokens):
                return True, "No changes detected."

            current_config[action_key] = tokens

            backup_ref = ConfigFileHandler.save_json_with_backup(
                file_path, current_config, operator, f"Update Policy: {action_key}"
            )

            logger.warning(f"策略变更 [{action_key}]: {old_tokens} -> {tokens}", extra={
                "action": "UPDATE_POLICY",
                "user": operator,
                "target_model": "SecurityPolicy",
                "target_id": action_key,
                "changes": {"before": old_tokens, "after": tokens, "backup": backup_ref},
                "status": "Success",
                "note": "Policy Matrix Update",
                "log_type": "Regular"
            })

            return True, "策略已更新"

        except Exception as e:
            logger.error(f"策略更新失败: {e}",
                               extra={"user": operator, "action": "UPDATE_POLICY", "status": "Failed(System)",
                                      "log_type": "System"})
            return False, str(e)

    # =========================================================================
    # 3. 职能管理 (Admin Capabilities)
    # =========================================================================

    @classmethod
    def get_capabilities(cls) -> Dict[str, bool]:
        defaults = {
            "can_create_user": True,
            "can_lock_user": True,
            "can_delete_user": False,
            "can_change_role": False,  # Default off to prevent privilege escalations
            "can_reset_pwd": True,
            "can_manage_perms": True
        }
        # [Fix] 使用类常量读取
        saved = ConfigFileHandler.load_json(cls.CAPABILITIES_FILE)
        defaults.update(saved)
        return defaults

    @classmethod
    def save_capabilities(cls, new_caps: Dict[str, bool], operator: str) -> Tuple[bool, str]:
        """保存所有职能开关"""
        file_path = cls.CAPABILITIES_FILE

        try:
            current_caps = ConfigFileHandler.load_json(file_path, default={})

            changes = {}
            for k, v in new_caps.items():
                if current_caps.get(k) != v:
                    changes[k] = {"old": current_caps.get(k), "new": v}

            if not changes:
                return True, "无变更"

            backup_ref = ConfigFileHandler.save_json_with_backup(
                file_path, new_caps, operator, "Batch Update Capabilities"
            )

            logger.warning(f"职能开关批量变更 | Backup: {backup_ref}", extra={
                "action": "UPDATE_CAPABILITIES",
                "user": operator,
                "target_model": "AdminCapability",
                "target_id": "ALL",
                "changes": changes,
                "status": "Success",
                "log_type": "Regular"
            })

            return True, "职能配置已生效"

        except Exception as e:
            logger.error(f"职能保存失败: {e}",
                               extra={"user": operator, "action": "UPDATE_CAPABILITIES", "status": "Failed(System)",
                                      "log_type": "System"})
            return False, str(e)