# File: backend/apps/user_admin/views/actions.py
"""
# ==============================================================================
# 模块名称: 用户管理敏感操作 (User Admin Actions)
# ==============================================================================
#
# [Purpose / 用途]
# 处理高风险的写入请求 (POST Only)，如创建用户、删除用户、修改密码。
#
# [ISO Compliance / 合规性]
# - 审计追踪: 这里的操作通过 audit_logger 记录，Context通过 AuditContextManager 注入。
# - 严格鉴权: 必须执行 SecurityPolicyManager.verify_action_request (Action Token)。
# - 权限隔离: SuperAdmin > Admin > User 严格层级控制。
#
# ==============================================================================
"""
from __future__ import annotations
import json

from django.shortcuts import render
from django.http import HttpResponse, HttpResponseBadRequest
from django.utils.translation import gettext as _
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.contrib import messages

from backend.common.settings import settings
from backend.core.sys.logger import get_audit_logger
from backend.core.services.auth.service import AuthService
from backend.core.services.security.policy_manager import SecurityPolicyManager
# [ISO] Context Manager
from backend.apps.audit.core.context import AuditContextManager
from backend.apps.audit.core.dto import LogStatus, LogType

from backend.apps.user_admin.core.services import UserAdminService
from backend.apps.user_admin.core.utils import ConfigFileHandler

# Utils (Role/Capability Managers)
from backend.apps.user_admin.utils import RoleManager, CapabilityManager, PasswordPolicyValidator

audit_logger = get_audit_logger()


def _check_admin_capability(request, cap_key: str, action_name: str, target: str) -> bool:
    """Helper to check Admin Capability and log denial if failed."""
    if request.user.is_superuser:
        return True
    
    # Check Capability
    if not CapabilityManager.check_capability(request.user, cap_key):
        msg = f"权限不足: {action_name} 职能已被禁用。"
        messages.error(request, msg)
        audit_logger.warning(f"{action_name} 拒绝 - 职能受限", extra={
            "action": "CHECK_CAPABILITY",
            "target": target,
            "status": "Failed(Permission)",
            "root_cause": "Admin Capability Disabled",
            "note": f"Missing Cap: {cap_key}"
        })
        return False
    return True

def _check_heirarchy(request, target_username: str, action_name: str) -> bool:
    """Helper to check Role Hierarchy (Actor > Target)."""
    # Self management is sometimes allowed, but this check is for "Manage Target".
    # Caller handles self-check if needed.
    
    # Get target user object (or mock/check DB)
    # Ideally use AuthService to get user role level
    # Here using RoleManager helper which expects User objects.
    # To avoid DB hit if we only have username, we might need a helper in RoleManager or AuthService.
    # Assuming AuthService.get_user returns User object or None.
    target_user = AuthService.get_user_by_username(target_username)
    if not target_user:
        return True # Target likely doesn't exist, let downstream handle 404
        
    if not RoleManager.can_manage_target(request.user, target_user):
        msg = f"权限不足: 您的职级无法 {action_name} 该用户 ({target_username})。"
        messages.error(request, msg)
        audit_logger.warning(f"{action_name} 拒绝 - 职级限制", extra={
            "action": "CHECK_HIERARCHY",
            "target": target_username,
            "status": "Failed(Permission)",
            "root_cause": "Role Hierarchy Violation",
            "note": f"Actor Level {RoleManager.get_role_level(request.user)} <= Target Level {RoleManager.get_role_level(target_user)}"
        })
        return False
    return True


# -----------------------------------------------------------------------------
# Users: Create
# -----------------------------------------------------------------------------
@login_required
@require_POST
def user_create(request):
    # [ISO] Trace Context
    AuditContextManager.set_page_hierarchy(["用户管理", "用户列表", "注册新用户"])
    operator = request.user.username

    # 1. Security Policy (Token)
    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, "btn_create_user")
    if not is_valid:
        return HttpResponse(f"Security Check Failed: {sec_msg}", status=403)

    # 2. Capability Check
    if not _check_admin_capability(request, "can_create_user", "创建用户", "NewUser"):
        return HttpResponse("Capability Disabled", status=403)

    u = (request.POST.get("username") or "").strip()
    p = (request.POST.get("password") or "").strip()
    role = (request.POST.get("role") or "user").strip()
    
    # 3. Role Constraints
    # 1.2 "不能为 super admin, 若 admin 注册只能是 user"
    if role == "superadmin":
         messages.error(request, "无法创建 Super Admin。")
         return HttpResponse("Invalid Role", status=400)
    
    if not request.user.is_superuser:
        if role == "admin":
             messages.error(request, "普通 Admin 仅能创建 User 角色。")
             audit_logger.warning("创建用户拒绝 - 越权", extra={
                "action": "CREATE_USER",
                "target": u,
                "status": "Failed(Permission)",
                "root_cause": "Role Escalation Attempt",
                "note": "Admin tried to create Admin"
             })
             return HttpResponse("Role Escalation Denied", status=403)

    if not u or not p:
        return HttpResponse("Validation Error: Username/Password missing", status=400)

    is_admin_flag = (role == "admin")
    success, msg = AuthService.create_user(u, p, is_admin_flag)

    if success:
        audit_logger.info(f"创建用户 [{u}]", extra={
            "action": "CREATE_USER",
            "target": u,
            "status": "Success",
            "note": f"Role={role}",
            "log_type": "Regular",
            "details": f"Created user {u} with role {role}"
        })
        
        # Render Row with toast
        user_ui_data = {
            "username": u,
            "role_label": "Admin" if is_admin_flag else "User",
            "role_class": "text-info border-info" if is_admin_flag else "text-secondary border-secondary",
            "role_weight": 1 if is_admin_flag else 2,
            "is_locked": False,
            "failed_attempts": 0,
            "is_protected": False,
            "last_login": "Never",
            "row_id": f"user_row_{u}"
        }
        resp = render(request, "user_admin/components/users/user_row.html", {"user": user_ui_data})
        resp["HX-Trigger"] = json.dumps({"showToast": f"用户 {u} 创建成功"})
        return resp
    else:
        audit_logger.error(f"创建用户失败: {msg}", extra={
            "action": "CREATE_USER",
            "target": u,
            "status": "Failed(Data)",
            "root_cause": msg
        })
        resp = HttpResponse(status=400)
        resp["HX-Trigger"] = json.dumps({"showError": f"创建失败: {msg}"})
        return resp


# -----------------------------------------------------------------------------
# Users: Delete
# -----------------------------------------------------------------------------
@login_required
@require_POST
def user_delete(request, target_username):
    AuditContextManager.set_page_hierarchy(["用户管理", "用户列表", "删除用户"])
    operator = request.user.username
    reason = (request.POST.get("reason") or "").strip()
    
    if not reason:
        return HttpResponse("Reason Required", status=400)

    # 1. Security Policy
    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, "btn_delete_user")
    if not is_valid:
        messages.error(request, sec_msg)
        return HttpResponse(sec_msg, status=403)

    # 2. Capability
    if not _check_admin_capability(request, "can_delete_user", "删除用户", target_username):
        return HttpResponse("Capability Disabled", status=403)

    if target_username == operator:
        messages.error(request, "无法删除自己。")
        return HttpResponse("Self Delete Denied", status=400)
        
    if target_username == settings.SUPER_ADMIN_USER:
        messages.error(request, "无法删除全站管理员。")
        return HttpResponse("Protected User", status=400)

    # 3. Hierarchy Check
    if not _check_heirarchy(request, target_username, "删除用户"):
        return HttpResponse("Hierarchy Violation", status=403)

    from backend.core.services.database_service import DatabaseService

    # Execute
    # [ISO] Rollback for User Deletion removed as per user request (Only Data tables allowed for auto-rollback)
    # If needed, log service logs permanent deletion.
    
    success, msg = AuthService.delete_user(target_username)

    if success:
        audit_logger.warning("用户已物理删除", extra={
            "action": "DELETE_USER",
            "target": target_username,
            "status": "Success",
            "note": f"Reason: {reason}",
            "log_type": "Permanent",
            "details": f"Deleted user {target_username}"
        })
        # [Fix] Return empty content with toast - HTMX outerHTML will remove the row
        resp = HttpResponse("")
        resp["HX-Trigger"] = json.dumps({"showToast": f"用户 {target_username} 已被永久删除"})
        return resp
    else:
        audit_logger.error("删除用户失败", extra={
            "action": "DELETE_USER",
            "target": target_username,
            "status": "Failed(System)",
            "root_cause": msg,
            "log_type": "Permanent"
        })
        resp = HttpResponse(status=500)
        resp["HX-Trigger"] = json.dumps({"showError": f"删除失败: {msg}"})
        return resp


# -----------------------------------------------------------------------------
# Users: Lock / Unlock
# -----------------------------------------------------------------------------
@login_required
@require_POST
def user_manage_action(request, target_username):
    action = (request.POST.get("action") or "").strip()
    op_name = "锁定用户" if action == "lock" else "解锁用户"
    AuditContextManager.set_page_hierarchy(["用户管理", "用户列表", op_name])
    
    reason = (request.POST.get("reason") or "").strip()

    # 1. Security Policy
    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, "btn_toggle_user_lock")
    if not is_valid:
        return HttpResponse(f"Security Check Failed: {sec_msg}", status=403)

    # 2. Capability
    if not _check_admin_capability(request, "can_lock_user", op_name, target_username):
        return HttpResponse("Capability Disabled", status=403)

    if target_username == settings.SUPER_ADMIN_USER:
         return HttpResponse("Protected User", status=400)

    # 3. Hierarchy
    if not _check_heirarchy(request, target_username, op_name):
        return HttpResponse("Hierarchy Violation", status=403)

    # Execute
    try:
        from backend.core.components.db.client import DBClient
        client = DBClient()
        
        action_msg = ""
        if action == "lock":
            client.execute_stmt("UPDATE User_Account SET is_locked=1 WHERE username=:u", {"u": target_username})
            action_msg = f"账户 {target_username} 已锁定"
        elif action == "unlock":
            client.execute_stmt("UPDATE User_Account SET is_locked=0, failed_attempts=0 WHERE username=:u", {"u": target_username})
            action_msg = f"账户 {target_username} 已解锁"
        else:
            return HttpResponseBadRequest("Invalid Action")

        audit_logger.warning(f"{op_name}", extra={
            "action": "LOCK_TOGGLE",
            "target": target_username,
            "status": "Success",
            "note": f"Action={action}, Reason={reason}",
            "details": f"Set locked state to {action}"
        })
        
        # Return updated row with toast
        users = UserAdminService.get_enhanced_user_list(request.user)
        ui_data = next((u for u in users if u["username"] == target_username), None)
        if ui_data:
            resp = render(request, "user_admin/components/users/user_row.html", {"user": ui_data})
            resp["HX-Trigger"] = json.dumps({"showToast": action_msg})
            return resp
        resp = HttpResponse("")
        resp["HX-Trigger"] = json.dumps({"showToast": action_msg})
        return resp

    except Exception as e:
        audit_logger.error(f"{op_name} 异常", extra={
            "action": "LOCK_TOGGLE",
            "target": target_username,
            "status": "Failed(System)",
            "root_cause": str(e)
        })
        resp = HttpResponse(status=500)
        resp["HX-Trigger"] = json.dumps({"showError": f"操作失败: {str(e)}"})
        return resp


# -----------------------------------------------------------------------------
# Users: Reset Password
# -----------------------------------------------------------------------------
@login_required
@require_POST
def user_reset_password(request):
    AuditContextManager.set_page_hierarchy(["用户管理", "用户列表", "重置密码"])
    operator = request.user.username

    target_u = (request.POST.get("username") or "").strip()
    old_p = (request.POST.get("old_password") or "").strip()
    new_p = (request.POST.get("new_password") or "").strip()
    confirm_p = (request.POST.get("confirm_password") or "").strip()

    is_self = (target_u == operator)

    # 1. Security Policy
    if not is_self:
        is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, "btn_reset_pwd")
        if not is_valid:
            resp = HttpResponse(status=403)
            resp["HX-Trigger"] = json.dumps({"showError": f"安全验证失败: {sec_msg}"})
            return resp
            
        # 2. Capability
        if not _check_admin_capability(request, "can_reset_pwd", "重置密码", target_u):
            resp = HttpResponse(status=403)
            resp["HX-Trigger"] = json.dumps({"showError": "您没有重置密码的权限"})
            return resp
            
        # 3. Hierarchy
        if not _check_heirarchy(request, target_u, "重置密码"):
            resp = HttpResponse(status=403)
            resp["HX-Trigger"] = json.dumps({"showError": "权限不足：无法对该用户操作"})
            return resp
            
    else:
        # Self Check
        if not old_p:
            resp = HttpResponse(status=400)
            resp["HX-Trigger"] = json.dumps({"showError": "请输入当前密码"})
            return resp
        # Verify old password (仅验证，不刷新 token)
        if not AuthService.verify_password_only(target_u, old_p):
            resp = HttpResponse(status=403)
            resp["HX-Trigger"] = json.dumps({"showError": "当前密码不正确"})
            return resp

    if new_p != confirm_p:
        resp = HttpResponse(status=400)
        resp["HX-Trigger"] = json.dumps({"showError": "两次输入的新密码不一致"})
        return resp

    success, msg = AuthService.reset_password(target_u, new_p)
    if success:
        audit_logger.info("密码修改成功", extra={
            "action": "RESET_PWD",
            "target": target_u,
            "status": "Success",
            "note": "Self" if is_self else "Force Reset"
        })
        # [Fix] Return success with HX-Trigger for toast
        resp = HttpResponse("")
        resp["HX-Trigger"] = json.dumps({"showToast": f"用户 {target_u} 密码修改成功"})
        return resp
    else:
        audit_logger.error("密码修改失败", extra={
            "action": "RESET_PWD",
            "target": target_u,
            "status": "Failed(System)",
            "root_cause": msg
        })
        resp = HttpResponse(status=400)
        resp["HX-Trigger"] = json.dumps({"showError": f"密码修改失败: {msg}"})
        return resp


# -----------------------------------------------------------------------------
# Users: Reset Password (Self Only - No Security Matrix)
# -----------------------------------------------------------------------------
@login_required
@require_POST
def user_reset_password_self(request):
    """Self password reset - requires old password verification only, no security matrix."""
    AuditContextManager.set_page_hierarchy(["用户管理", "用户列表", "修改我的密码"])
    target_u = request.user.username

    old_p = (request.POST.get("old_password") or "").strip()
    new_p = (request.POST.get("new_password") or "").strip()
    confirm_p = (request.POST.get("confirm_password") or "").strip()

    # Verify old password
    if not old_p:
        resp = HttpResponse(status=400)
        resp["HX-Trigger"] = json.dumps({"showError": "请输入当前密码"})
        return resp
    
    # 仅验证，不刷新 token
    if not AuthService.verify_password_only(target_u, old_p):
        resp = HttpResponse(status=403)
        resp["HX-Trigger"] = json.dumps({"showError": "当前密码不正确"})
        return resp

    if new_p != confirm_p:
        resp = HttpResponse(status=400)
        resp["HX-Trigger"] = json.dumps({"showError": "两次输入的新密码不一致"})
        return resp
    
    if len(new_p) < 5:
        resp = HttpResponse(status=400)
        resp["HX-Trigger"] = json.dumps({"showError": "新密码长度至少5位"})
        return resp

    success, msg = AuthService.reset_password(target_u, new_p)
    if success:
        audit_logger.info("密码修改成功 (Self)", extra={
            "action": "RESET_PWD_SELF",
            "target": target_u,
            "status": "Success",
            "note": "Self Reset"
        })
        resp = HttpResponse("")
        resp["HX-Trigger"] = json.dumps({"showToast": "密码修改成功"})
        return resp
    else:
        audit_logger.error("密码修改失败", extra={
            "action": "RESET_PWD_SELF",
            "target": target_u,
            "status": "Failed(System)",
            "root_cause": msg
        })
        resp = HttpResponse(status=400)
        resp["HX-Trigger"] = json.dumps({"showError": f"密码修改失败: {msg}"})
        return resp


# -----------------------------------------------------------------------------
# Users: Change Role
# -----------------------------------------------------------------------------
@login_required
@require_POST
def user_change_role(request, target_username):
    direction = request.POST.get("direction", "")
    op_name = f"职级变更-{direction}"
    AuditContextManager.set_page_hierarchy(["用户管理", "用户列表", op_name])
    
    # 1. Security Policy
    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, "btn_change_user_role")
    if not is_valid:
        resp = HttpResponse(status=403)
        resp["HX-Trigger"] = json.dumps({"showError": f"安全验证失败: {sec_msg}"})
        return resp

    # 2. Capability
    if not _check_admin_capability(request, "can_change_role", "变更职级", target_username):
        resp = HttpResponse(status=403)
        resp["HX-Trigger"] = json.dumps({"showError": "您没有变更职级的权限"})
        return resp

    # 3. Hierarchy (Managed logic)
    if not _check_heirarchy(request, target_username, "变更职级"):
        resp = HttpResponse(status=403)
        resp["HX-Trigger"] = json.dumps({"showError": "权限不足：无法对该用户操作"})
        return resp

    # Execute
    new_role = "admin" if direction == "up" else "user"
    is_admin_val = 1 if new_role == "admin" else 0
    role_label = "管理员" if new_role == "admin" else "普通用户"
    
    from backend.core.components.db.client import DBClient
    import time
    
    client = DBClient()
    # Update role and set role_version timestamp for real-time sync
    role_version = int(time.time() * 1000)  # Millisecond timestamp
    client.execute_stmt(
        "UPDATE User_Account SET is_admin=:a, role_version=:v WHERE username=:u", 
        {"a": is_admin_val, "v": role_version, "u": target_username}
    )
    
    audit_logger.warning("职级变更", extra={
        "action": "CHANGE_ROLE",
        "target": target_username,
        "status": "Success",
        "note": f"Direction={direction}, NewRole={new_role}",
        "details": f"Changed {target_username} role to {new_role}"
    })
    
    action_msg = f"用户 {target_username} 已变更为{role_label}"
    
    # [Fix] Return HX-Trigger to refresh entire user list (for proper re-sorting by role)
    # Instead of returning single row, trigger a full list refresh
    resp = HttpResponse("")
    resp["HX-Trigger"] = json.dumps({
        "showToast": action_msg,
        "refreshUserList": True  # Custom event to trigger list refresh
    })
    return resp


# -----------------------------------------------------------------------------
# Tab2 & Tab3: Policy / Capability
# -----------------------------------------------------------------------------
@login_required
@require_POST
def policy_update(request):
    """批量保存所有策略配置"""
    AuditContextManager.set_page_hierarchy(["用户管理", "密码策略矩阵", "保存策略"])
    # Only Super Admin
    if not request.user.is_superuser:
        audit_logger.warning("策略更新拒绝", extra={"action": "UPDATE_POLICY", "status": "Failed(Permission)"})
        resp = HttpResponse(status=403)
        resp["HX-Trigger"] = json.dumps({"showError": "仅超级管理员可操作"})
        return resp
    
    # Parse policy data from form
    # Format: policy_<action_key>[] = token values
    policy_map = {}
    for key in request.POST.keys():
        if key.startswith("policy_"):
            action_key = key[7:]  # Remove "policy_" prefix
            tokens = request.POST.getlist(key)
            policy_map[action_key] = tokens
    
    if not policy_map:
        resp = HttpResponse(status=400)
        resp["HX-Trigger"] = json.dumps({"showError": "无策略数据"})
        return resp
        
    success, msg = UserAdminService.update_all_policies(policy_map, request.user.username)
    if success:
        # Reset ALL policy caches for immediate effect
        SecurityPolicyManager.reset_cache()
        PasswordPolicyValidator.reset_cache()
        audit_logger.info("策略批量更新成功", extra={"action": "BATCH_UPDATE_POLICY", "status": "Success", "note": msg})
        resp = HttpResponse("")
        resp["HX-Trigger"] = json.dumps({"showToast": msg})
        return resp
    resp = HttpResponse(status=500)
    resp["HX-Trigger"] = json.dumps({"showError": f"保存失败: {msg}"})
    return resp

@login_required
@require_POST
def capability_toggle(request):
    AuditContextManager.set_page_hierarchy(["用户管理", "职能开关", "保存配置"])
    if not request.user.is_superuser:
         return HttpResponse("Super Admin Only", status=403)
         
    enabled_keys = request.POST.getlist("caps")
    all_keys = ["can_create_user", "can_lock_user", "can_reset_pwd", "can_manage_perms", "can_delete_user", "can_change_role"]
    new_caps = {k: (k in enabled_keys) for k in all_keys}
    
    success, msg = UserAdminService.save_capabilities(new_caps, request.user.username)
    if success:
        resp = HttpResponse(f"<span class='text-success small fw-bold'><i class='fa-solid fa-check me-1'></i>{_('保存成功')}</span>")
        resp["HX-Trigger"] = json.dumps({"showToast": "职能配置已保存"})
        resp["HX-Refresh"] = "true"
        return resp
    resp = HttpResponse(status=500)
    resp["HX-Trigger"] = json.dumps({"showError": f"保存失败: {msg}"})
    return resp

# Permissions Update
@login_required
@require_POST
def user_update_permissions(request, target_username):
    AuditContextManager.set_page_hierarchy(["用户管理", "用户列表", "板块管理"])
    
    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, "btn_update_perms")
    if not is_valid:
        resp = HttpResponse(status=403)
        resp["HX-Trigger"] = json.dumps({"showError": f"安全验证失败: {sec_msg}"})
        return resp
    
    if not _check_admin_capability(request, "can_manage_perms", "板块管理", target_username):
        resp = HttpResponse(status=403)
        resp["HX-Trigger"] = json.dumps({"showError": "您没有管理权限的能力"})
        return resp
        
    if not _check_heirarchy(request, target_username, "板块管理"):
        resp = HttpResponse(status=403)
        resp["HX-Trigger"] = json.dumps({"showError": "权限不足：无法对该用户操作"})
        return resp
        
    # Logic to save perms
    selected_perms = request.POST.getlist("perms")
    
    # [Debug] 脱敏日志：仅打印key
    print(f"[DEBUG perm-save] selected_perms count: {len(selected_perms)}")
    if selected_perms:
        print(f"[DEBUG perm-save] first 20 keys: {selected_perms[:20]}")
    
    # [Whitelist] 强制校验：拒绝任何非白名单权限
    from backend.core.services.security.inventory import SecurityInventory
    invalid_perms = [p for p in selected_perms if p not in SecurityInventory.WHITELIST_PERMISSIONS]
    if invalid_perms:
        print(f"[DEBUG perm-save] invalid_keys (not in whitelist): {invalid_perms}")
        audit_logger.warning("权限保存拒绝 - 包含非白名单项", extra={
            "action": "UPDATE_PERMS",
            "target": target_username,
            "status": "Failed(Validation)",
            "root_cause": "Invalid permission keys submitted",
            "note": f"Count: {len(invalid_perms)}, Keys: {invalid_perms[:5]}"
        })
        resp = HttpResponse(status=403)
        resp["HX-Trigger"] = json.dumps({"showError": "包含未知权限项，已拒绝保存"})
        return resp
    
    # Verify inheritance (cannot grant what you don't have)
    if not request.user.is_superuser:
        op_perms = set(AuthService.get_permissions(request.user.username))
        req_perms = set(selected_perms)
        forbidden_perms = req_perms - op_perms
        if forbidden_perms:
            print(f"[DEBUG perm-save] forbidden_keys (not in actor perms): {list(forbidden_perms)}")
            audit_logger.warning("权限保存拒绝 - admin越权", extra={
                "action": "UPDATE_PERMS",
                "target": target_username,
                "status": "Failed(Permission)"
            })
            resp = HttpResponse(status=403)
            resp["HX-Trigger"] = json.dumps({"showError": "包含超出当前操作者权限范围的项，已拒绝保存"})
            return resp
            
    AuthService.set_permissions(target_username, selected_perms)
    audit_logger.info("更新用户权限", extra={
        "action": "UPDATE_PERMS",
        "target": target_username,
        "status": "Success",
        "details": f"Set perms count: {len(selected_perms)}"
    })
    # [Fix] Return empty with toast - let frontend handle navigation
    resp = HttpResponse("")
    resp["HX-Trigger"] = json.dumps({"showToast": f"用户 {target_username} 权限已更新"})
    return resp


# -----------------------------------------------------------------------------
# API: Check Role Version (for real-time role change detection)
# -----------------------------------------------------------------------------
@login_required
def check_role_version(request):
    """
    [API] 返回当前用户的角色信息和版本号
    用于前端轮询检测角色是否被修改
    """
    from django.http import JsonResponse
    from backend.core.components.db.client import DBClient
    
    username = request.user.username
    
    try:
        df = DBClient.read_df(
            "SELECT is_admin, role_version FROM User_Account WHERE username=:u LIMIT 1",
            {"u": username}
        )
        
        if df.empty:
            return JsonResponse({"error": "User not found"}, status=404)
        
        row = df.iloc[0]
        is_admin = bool(row.get("is_admin", 0))
        role_version = int(row.get("role_version", 0) or 0)
        
        # Determine role label
        if username == settings.SUPER_ADMIN_USER:
            role_label = "Super Admin"
        elif is_admin:
            role_label = "Admin"
        else:
            role_label = "User"
        
        return JsonResponse({
            "username": username,
            "is_admin": is_admin,
            "role_label": role_label,
            "role_version": role_version
        })
        
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)