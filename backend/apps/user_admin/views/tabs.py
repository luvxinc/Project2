# File: backend/apps/user_admin/views/tabs.py
"""
# ==============================================================================
# 模块名称: 用户管理 Tab 视图 (User Admin Tabs)
# ==============================================================================
#
# [Purpose / 用途]
# 渲染各类 HTMX Tab 片段 (Users, Policies, Capabilities, Permissions)。
#
# [Architecture / 架构]
# - Layer: Presentation (View)
# - Pattern: Server-Side Rendering (HTMX)
#
# [ISO Compliance / 合规性]
# - 错误处理: 必须捕获加载异常并写入 System Log，而不是仅仅向用户显示 500。
#
# ==============================================================================
"""

from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse

# 引入业务逻辑服务
from backend.apps.user_admin.core.services import UserAdminService
from backend.core.services.auth.service import AuthService
from backend.core.services.security.inventory import SecurityInventory
from backend.common.settings import settings
# [Fix] 引入错误日志记录器
from backend.core.sys.logger import get_error_logger
from django.utils.translation import gettext as _

error_logger = get_error_logger()


def _add_no_cache_headers(response):
    """[Helper] 添加不缓存的 HTTP 头，确保每次加载都从服务器获取最新数据"""
    response["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response

@login_required(login_url='web_ui:login')
def user_admin_tab_content(request, tab_name):
    """
    [HTMX] 动态加载 Tab 内容
    URL: /dashboard/user_admin/tab/<tab_name>/
    """
    # 1. 基础权限检查
    if not (request.user.is_superuser or request.user.is_staff):
        return HttpResponse("Access Denied: Admin privileges required.", status=403)

    is_super = request.user.is_superuser
    context = {"tab_name": tab_name, "is_super": is_super}

    try:
        # =========================================================
        # Tab 1: 用户列表 (Users)
        # =========================================================
        if tab_name == 'users':
            # 获取增强版用户列表 (含角色、状态、最近登录)
            # [Fix] 传入 request.user 用于计算每一行的操作权限 (frontend grey-out logic)
            users = UserAdminService.get_enhanced_user_list(request.user)
            context.update({
                "users": users,
                "total_count": len(users)
            })
            resp = render(request, "user_admin/components/users/users_tab.html", context)
            return _add_no_cache_headers(resp)

        # =========================================================
        # Tab 2: 密码策略矩阵 (Policies) - 仅 Super Admin
        # =========================================================
        elif tab_name == 'policies':
            if not is_super:
                return HttpResponse(_("权限不足：仅超级管理员可见"), status=403)

            try:
                # 获取策略矩阵数据
                matrix = UserAdminService.get_policy_matrix()
                context.update({"modules": matrix["modules"]})
            except Exception as e:
                # 捕获策略文件读取失败，显示友好错误
                import traceback
                error_html = f"""
                <div class="alert alert-danger m-3">
                    <h5 class="alert-heading"><i class="fa-solid fa-triangle-exclamation"></i> 策略配置加载失败</h5>
                    <p>系统无法读取安全策略文件 (action_registry.json 或 security_overrides.json)。</p>
                    <hr>
                    <p class="mb-0 font-monospace small">{str(e)}</p>
                </div>
                """
                return HttpResponse(error_html)

            resp = render(request, "user_admin/components/password_policy/policy_matrix_content.html", context)
            return _add_no_cache_headers(resp)

        # =========================================================
        # Tab 3: 职能开关 (Capabilities) - 仅 Super Admin
        # =========================================================
        elif tab_name == 'capabilities':
            if not is_super:
                return HttpResponse(_("权限不足：仅超级管理员可见"), status=403)

            # 获取所有开关状态
            caps = UserAdminService.get_capabilities()
            context.update({
                "caps": caps
            })
            resp = render(request, "components/ua_tab_capabilities.html", context)
            return _add_no_cache_headers(resp)

    except Exception as e:
        # =========================================================
        # 全局异常熔断 (Global Error Handler)
        # =========================================================
        import traceback
        tb = traceback.format_exc()

        # [Critical Fix] 显式记录异常到系统日志，否则 error.log 会漏掉这些错误
        error_logger.error(
            f"UserAdmin Tab Load Failed: {str(e)}",
            extra={
                "user": request.user.username,
                "func": "UserAdmin:Tab",
                "action": "LOAD_TAB",
                "target": tab_name,
                "status": "Failed(System)",
                "root_cause": str(e),
                "details": tb
            }
        )

        # 返回可视化的错误堆栈，而不是 500 页面，方便调试
        return HttpResponse(f"""
            <div class="alert alert-danger m-4 shadow-sm border-danger bg-danger bg-opacity-10">
                <h5 class="alert-heading text-danger fw-bold"><i class="fa-solid fa-bug me-2"></i>模块加载异常 (Module Error)</h5>
                <hr class="border-danger opacity-25">
                <p class="mb-2 font-monospace small text-white">{str(e)}</p>
                <details>
                    <summary class="small cursor-pointer text-danger opacity-75">点击查看技术堆栈 (Stack Trace)</summary>
                    <pre class="mt-2 bg-black bg-opacity-50 p-3 rounded text-danger small font-monospace overflow-auto" style="max-height: 300px;">{tb}</pre>
                </details>
            </div>
        """)

    return HttpResponse(f"Unknown Tab: {tab_name}", status=404)


@login_required(login_url='web_ui:login')
def user_list_panel(request):
    """
    [HTMX] Render the main User List Panel (Back Button Target)
    """
    users = UserAdminService.get_enhanced_user_list(request.user)
    context = {"users": users, "total_count": len(users)}
    return render(request, "user_admin/components/users/user_list_panel.html", context)


@login_required(login_url='web_ui:login')
def user_permission_form(request, target_username):
    """
    [HTMX] Render Permission Panel (Replaces User List)
    """
    if not (request.user.is_superuser or request.user.is_staff):
        return HttpResponse("Permission Denied", status=403)
    
    if target_username == settings.SUPER_ADMIN_USER:
         return HttpResponse("<div class='p-5 text-white'>Cannot edit Super Admin permissions.</div>")

    try:
        full_tree = SecurityInventory.get_full_permission_tree()
        # [Fix P0-1/P0-2] Use raw permissions (no parent inference) for UI rendering
        user_perms_map = AuthService.get_raw_permissions(target_username)
        # [New] Get actor permissions for validation (with inference for view checks)
        actor_perms_map = AuthService.get_permissions(request.user.username) or {}
        
        # [UI] Get target user's role for display
        target_user = AuthService.get_user_by_username(target_username)
        if target_user:
            if target_user.is_superuser:
                target_role = "Super Admin"
            elif target_user.is_staff:
                target_role = "Admin"
            else:
                target_role = "User"
        else:
            target_role = "Unknown"
        
        context = {
            "target_username": target_username,
            "target_role": target_role,  # [New] For UI display
            "permission_tree": full_tree,
            "current_perms": user_perms_map,
            # [New] Pass actor perm info
            "actor_perms": actor_perms_map,
            "is_superuser": request.user.is_superuser
        }
        # [Mod] Render Panel instead of Modal
        resp = render(request, "user_admin/components/permissions/permissions_panel.html", context)
        return _add_no_cache_headers(resp)
    except Exception as e:
        error_logger.error(f"Perm Panel Error: {e}")
        import traceback
        return HttpResponse(f"""
        <div class="alert alert-danger m-4 shadow-sm">
            <h5 class="alert-heading"><i class="fa-solid fa-bomb me-2"></i>权限面板加载失败</h5>
            <hr>
            <p class="mb-2">系统在加载权限数据时遇到意外错误：</p>
            <code class="d-block bg-black bg-opacity-25 p-3 rounded mb-3 text-warning font-monospace">{str(e)}</code>
            <details>
                <summary class="text-secondary small cursor-pointer">查看技术堆栈 (Click to expand)</summary>
                <pre class="mt-2 text-white-50 small overflow-auto" style="max-height: 200px;">{traceback.format_exc()}</pre>
            </details>
        </div>
        """)


@login_required
def user_delete_form(request, target_username):
    return render(request, "user_admin/components/actions/delete_panel.html", {"target_username": target_username})

@login_required
def user_reset_pwd_form(request, target_username):
    return render(request, "user_admin/components/actions/reset_pwd_panel.html", {"target_username": target_username})