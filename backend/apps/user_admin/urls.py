# File: backend/apps/user_admin/urls.py
"""
# ==============================================================================
# 模块名称: 用户管理路由 (User Admin URLs)
# ==============================================================================
#
# ⚠️ [DEPRECATED] 2026-02-04 - 已迁移到 V2
# 待删除时间: 2026-02-18 (2周后)
# V2 替代: apps/api/src/modules/users/
#
# [Purpose / 用途]
# 定义用户管理模块的 API 路由。
#
# [Architecture / 架构] v2.0 - 路由下沉版本
# - Namespace: apps.user_admin
# - Structure:
#   - /: Hub (传送页)
#   - /users/: 用户列表页面
#   - /register/: 注册新用户页面
#   - /password_policy/: 密码策略页面
#   - /role_switches/: 职能开关页面
#   - /tab/: HTMX Fragments (保留兼容)
#   - /actions/: POST operations
#
# ==============================================================================
"""
from django.urls import path
from .views import main, tabs, actions

urlpatterns = [
    # ===========================================
    # Hub (入口传送页)
    # ===========================================
    path('', main.dashboard, name='dashboard'),

    # ===========================================
    # 独立页面路由（路由下沉）
    # ===========================================
    path('users/', main.users_page, name='user_admin_users'),
    path('register/', main.register_page, name='user_admin_register'),
    path('password_policy/', main.password_policy_page, name='user_admin_password_policy'),
    path('role_switches/', main.role_switches_page, name='user_admin_role_switches'),

    # ===========================================
    # API 路由
    # ===========================================
    path('api/users/', main.get_user_list, name='get_user_list'),
    path('api/check-username/', main.check_username_exists, name='check_username_exists'),
    path('api/register/', main.register_user_api, name='register_user_api'),

    # ===========================================
    # HTMX Tabs (保留兼容，后续可移除)
    # ===========================================
    path('tab/<str:tab_name>/', tabs.user_admin_tab_content, name='tab_content'),
    path('panel/users/', tabs.user_list_panel, name='panel_user_list'),
    path('panel/permissions/<str:target_username>/', tabs.user_permission_form, name='permission_form'),
    path('panel/delete/<str:target_username>/', tabs.user_delete_form, name='delete_form'),
    path('panel/reset_pwd/<str:target_username>/', tabs.user_reset_pwd_form, name='reset_pwd_form'),

    # ===========================================
    # Actions (保持不变)
    # ===========================================
    path('actions/create_user/', actions.user_create, name='user_create'),
    path('actions/delete_user/<str:target_username>/', actions.user_delete, name='user_delete'),
    path('actions/manage_user/<str:target_username>/', actions.user_manage_action, name='user_manage'),
    path('actions/change_role/<str:target_username>/', actions.user_change_role, name='user_change_role'),
    path('actions/reset_password/', actions.user_reset_password, name='user_reset_pwd_api'),
    path('actions/reset_password_self/', actions.user_reset_password_self, name='user_reset_pwd_self'),
    path('actions/update_permissions/<str:target_username>/', actions.user_update_permissions, name='user_update_permissions'),
    path('actions/policy_update/', actions.policy_update, name='policy_update'),
    path('actions/capability_toggle/', actions.capability_toggle, name='capability_toggle'),
    
    # API: Role Version Check (for real-time sync)
    path('api/check_role_version/', actions.check_role_version, name='check_role_version'),
]

