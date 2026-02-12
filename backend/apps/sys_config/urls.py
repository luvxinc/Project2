# File: backend/apps/sys_config/urls.py
"""
# ==============================================================================
# 模块名称: 系统配置路由 (System Config URLs)
# ==============================================================================
#
# [Purpose / 用途]
# 定义系统配置 API 的路由。
#
# ==============================================================================
"""

from django.urls import path
from .views import get_system_config

urlpatterns = [
    # 映射路径: /api/sys/config/
    # 注意: 主路由会处理前缀 'api/sys/'，这里只需要处理 'config/'
    path('config/', get_system_config, name='sys_config'),
]