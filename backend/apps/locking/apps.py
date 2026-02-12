# File: backend/apps/locking/apps.py
"""
# ==============================================================================
# 模块名称: 分布式锁配置 (Locking Config)
# ==============================================================================
#
# [Purpose / 用途]
# 初始化锁服务应用。
#
# ==============================================================================
"""
from django.apps import AppConfig

class LockingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'backend.apps.locking'