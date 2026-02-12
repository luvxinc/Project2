# File: backend/apps/user_admin/apps.py
"""
# ==============================================================================
# 模块名称: 用户管理配置 (User Admin Config)
# ==============================================================================
#
# [Purpose / 用途]
# 初始化用户管理模块应用。
#
# [ISO Compliance / 合规性]
# - 隔离性: 确保用户与权限管理逻辑的独立性 (Separation of Duties)。
#
# ==============================================================================
"""
from django.apps import AppConfig

class UserAdminConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'backend.apps.user_admin'
    verbose_name = '用户与权限管理中心'