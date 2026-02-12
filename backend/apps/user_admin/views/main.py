# File: backend/apps/user_admin/views/main.py
"""
# ==============================================================================
# 模块名称: 用户管理主视图 (User Admin Dashboard)
# ==============================================================================
#
# [Purpose / 用途]
# 用户管理模块的入口视图 (Shell Container)。
# 负责权限基线检查和初始上下文注入。
#
# [Structure / 结构] v2.0 - 路由下沉版本
# - Hub: 简化为传送页，只显示功能卡片
# - Pages: 独立页面（users, password_policy, role_switches, register）
#
# ==============================================================================
"""

import re
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.urls import reverse
from backend.core.services.auth.service import AuthService
from backend.apps.user_admin.core.services import UserAdminService
from backend.core.sys.response import StandardResponse
from django.utils.translation import gettext as _


@login_required
@require_http_methods(["GET"])
def dashboard(request):
    """
    [View] 渲染用户管理Hub页面（简化版传送页）
    权限: module.user_admin 或任意子权限
    """
    # [P0-2 Fix] Each feature checks its SPECIFIC leaf permission only
    perms = AuthService.get_permissions(request.user.username)
    has_list = bool(perms.get('module.user_admin.users'))
    has_perms = bool(perms.get('module.user_admin.perms'))
    
    # Hub access allowed if user has any user_admin sub-permission
    can_access = request.user.is_superuser or has_list or has_perms
    
    if not can_access:
        return render(request, "errors/403.html", status=403)

    # 注册新用户权限检查
    from backend.apps.user_admin.utils import CapabilityManager
    can_create = False
    if request.user.is_superuser:
        can_create = True
    elif request.user.is_staff:
        can_create = CapabilityManager.check_capability(request.user, 'can_create_user')

    # Hub Items - 始终显示所有卡片，通过 has_access 控制锁定状态
    hub_items = [
        {
            'id': 'users', 
            'name': _('用户列表'), 
            'icon': 'fas fa-users', 
            'desc': _('查看、搜索及管理系统用户账号状态。'),
            'url': reverse('web_ui:user_admin_users'),
            'has_access': request.user.is_superuser or has_list
        },
        {
            'id': 'register', 
            'name': _('注册新用户'), 
            'icon': 'fas fa-user-plus', 
            'desc': _('创建新的系统访问账号。'),
            'url': reverse('web_ui:user_admin_register'),
            'has_access': can_create
        },
        {
            'id': 'policies', 
            'name': _('密码策略'), 
            'icon': 'fas fa-shield-halved', 
            'desc': _('配置全局密码复杂度及安全矩阵。'),
            'url': reverse('web_ui:user_admin_password_policy'),
            'has_access': request.user.is_superuser
        },
        {
            'id': 'capabilities', 
            'name': _('职能开关'), 
            'icon': 'fas fa-toggle-on', 
            'desc': _('动态启用或禁用特定模块功能。'),
            'url': reverse('web_ui:user_admin_role_switches'),
            'has_access': request.user.is_superuser
        }
    ]

    return render(request, "user_admin/hub.html", {
        "user": request.user,
        "hub_items": hub_items
    })


# ===========================================
# 独立页面 Views（路由下沉后使用）
# 复用原有 tab/panel 的数据加载逻辑
# ===========================================

@login_required
@require_http_methods(["GET"])
def users_page(request):
    """
    用户列表独立页面
    复用原 ua_panel_user_list / ua_tab_users 的数据
    Permission: module.user_admin.users
    """
    # [P0-2 Fix] Check SPECIFIC leaf permission only
    perms = AuthService.get_permissions(request.user.username)
    has_list = bool(perms.get('module.user_admin.users'))
    
    if not (request.user.is_superuser or has_list):
        return render(request, "errors/403.html", status=403)
    
    # 加载用户列表数据（复用原有逻辑）
    users = UserAdminService.get_enhanced_user_list(request.user)
    
    return render(request, "user_admin/pages/users.html", {
        "users": users,
        "total_count": len(users),
        "is_super": request.user.is_superuser
    })


@login_required
@require_http_methods(["GET"])
def password_policy_page(request):
    """
    密码策略独立页面
    复用原 ua_tab_policies 的数据
    Permission: superuser only
    """
    if not request.user.is_superuser:
        return render(request, "errors/403.html", status=403)
    
    # 加载策略矩阵数据（复用原有逻辑）
    try:
        matrix = UserAdminService.get_policy_matrix()
        modules = matrix.get("modules", [])
    except Exception as e:
        modules = []
        # 错误会在模板中展示
    
    return render(request, "user_admin/pages/password_policy.html", {
        "modules": modules,
        "is_super": True
    })


@login_required
@require_http_methods(["GET"])
def role_switches_page(request):
    """
    职能开关独立页面
    复用原 ua_tab_capabilities 的数据
    Permission: superuser only
    """
    if not request.user.is_superuser:
        return render(request, "errors/403.html", status=403)
    
    # 加载职能开关数据（复用原有逻辑）
    caps = UserAdminService.get_capabilities()
    
    return render(request, "user_admin/pages/role_switches.html", {
        "caps": caps,
        "is_super": True
    })


@login_required
@require_http_methods(["GET"])
def register_page(request):
    """
    注册新用户独立页面
    复用原 ua_modal_user_form 的表单
    Permission: superuser 或 admin with can_create_user capability
    """
    from backend.apps.user_admin.utils import CapabilityManager
    
    can_create = False
    if request.user.is_superuser:
        can_create = True
    elif request.user.is_staff:
        can_create = CapabilityManager.check_capability(request.user, 'can_create_user')
    
    if not can_create:
        return render(request, "errors/403.html", status=403)
    
    return render(request, "user_admin/pages/register.html", {
        "is_super": request.user.is_superuser
    })


# ===========================================
# API Views（保持不变）
# ===========================================

@login_required
@require_http_methods(["GET"])
def get_user_list(request):
    """
    [API] 获取用户列表 (Standard Updated)
    """
    perms = AuthService.get_permissions(request.user.username)
    can_access = request.user.is_superuser or bool(perms.get('module.user_admin')) or bool(perms.get('module.user_admin.list'))
    
    if not can_access:
        return StandardResponse.error("Permission Denied", code=403)

    data = UserAdminService.get_enhanced_user_list()
    return StandardResponse.success(data=data, msg="User list retrieved")


@login_required
@require_http_methods(["GET"])
def check_username_exists(request):
    """
    [API] 检查用户名是否已存在（注册前校验用）
    GET: /dashboard/user_admin/api/check-username/?username=xxx
    返回: { "exists": true/false, "username": "xxx" }
    """
    from django.http import JsonResponse
    
    username = request.GET.get('username', '').strip()
    
    if not username:
        return JsonResponse({'exists': False, 'username': '', 'error': _('用户名不能为空')})
    
    # 查询数据库
    user = AuthService.get_user_by_username(username)
    exists = user is not None
    
    return JsonResponse({
        'exists': exists,
        'username': username
    })


@login_required
@require_http_methods(["POST"])
def register_user_api(request):
    """
    [API] 注册新用户（纯JSON接口，供注册向导使用）
    POST: /dashboard/user_admin/api/register/
    
    请求参数：
        - username: 用户名
        - password: 密码
        - role: 角色（默认user，注册向导固定为user）
        - 安全验证字段（security tokens）
    
    成功返回：{ "success": true, "username": "xxx", "role": "user" }
    失败返回：{ "success": false, "message": "人话错误" } + 4xx状态码
    """
    from django.http import JsonResponse
    from backend.apps.user_admin.utils import CapabilityManager
    from backend.core.services.security.policy_manager import SecurityPolicyManager
    from backend.core.sys.logger import get_audit_logger
    from backend.apps.audit.core.context import AuditContextManager
    
    audit_logger = get_audit_logger()
    AuditContextManager.set_page_hierarchy(["用户管理", "注册新用户"])
    
    # 1. 权限检查（superuser 或 admin with can_create_user）
    can_create = False
    if request.user.is_superuser:
        can_create = True
    elif request.user.is_staff:
        can_create = CapabilityManager.check_capability(request.user, 'can_create_user')
    
    if not can_create:
        return JsonResponse({'success': False, 'message': _('您没有创建用户的权限')}, status=403)
    
    # 2. 安全策略验证
    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, "btn_create_user")
    if not is_valid:
        return JsonResponse({'success': False, 'message': _('安全验证失败: {msg}').format(msg=sec_msg)}, status=403)
    
    # 3. 获取参数
    username = (request.POST.get('username') or '').strip()
    password = (request.POST.get('password') or '').strip()
    role = 'user'  # 注册向导固定为普通用户
    
    # 4. 参数验证
    if not username:
        return JsonResponse({'success': False, 'message': _('用户名不能为空')}, status=400)
    
    # [Security] Backend Format Validation (Fail Fast)
    if not re.match(r'^[a-zA-Z0-9_]{2,32}$', username):
        return JsonResponse({
            'success': False, 
            'message': _('用户名格式不正确: 仅允许英文字母、数字和下划线，长度2-32位')
        }, status=400)

    if not password:
        return JsonResponse({'success': False, 'message': _('密码不能为空')}, status=400)
    if len(password) < 5:
        return JsonResponse({'success': False, 'message': _('密码长度至少5位')}, status=400)
    
    # 5. 检查用户名是否已存在
    existing_user = AuthService.get_user_by_username(username)
    if existing_user:
        return JsonResponse({'success': False, 'message': _('用户名 "{username}" 已存在，请更换后重试').format(username=username)}, status=409)
    
    # 6. 创建用户
    is_admin_flag = (role == 'admin')
    success, msg = AuthService.create_user(username, password, is_admin_flag)
    
    if success:
        audit_logger.info(f"创建用户 [{username}] (via wizard)", extra={
            "action": "CREATE_USER",
            "target": username,
            "status": "Success",
            "note": f"Role={role}",
            "log_type": "Regular",
            "details": f"Created user {username} with role {role} via register wizard"
        })
        return JsonResponse({
            'success': True,
            'username': username,
            'role': role
        })
    else:
        audit_logger.error(f"创建用户失败: {msg}", extra={
            "action": "CREATE_USER",
            "target": username,
            "status": "Failed(Data)",
            "root_cause": msg
        })
        # 将技术错误转换为人话
        human_msg = _('创建用户失败，请稍后再试')
        if 'exist' in msg.lower() or 'duplicate' in msg.lower():
            human_msg = _('用户名 "{username}" 已存在').format(username=username)
        elif 'password' in msg.lower():
            human_msg = _('密码不符合要求')
        
        return JsonResponse({'success': False, 'message': human_msg}, status=400)