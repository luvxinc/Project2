# File: backend/apps/sys_config/apps.py
"""
# ==============================================================================
# 模块名称: 系统配置应用 (System Config App)
# ==============================================================================
#
# [Purpose / 用途]
# 初始化系统配置模块。
#
# ==============================================================================
"""
from django.apps import AppConfig

class SysConfigConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'backend.apps.sys_config'