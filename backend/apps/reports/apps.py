# File Path: backend/apps/reports/apps.py
"""
文件说明: 报表模块应用配置
修改点:
1. 将 name 从 'reports' 改为 'apps.reports'，以匹配目录结构。
"""
from django.apps import AppConfig

class ReportsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    # [关键修改] 修正路径
    name = 'apps.reports'