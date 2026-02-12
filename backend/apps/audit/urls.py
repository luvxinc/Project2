# File: backend/apps/audit/urls.py
"""
审计模块 URL 路由 (已迁移)
主要功能已迁移到 apps.log 模块
此文件仅提供向后兼容的重定向
"""
from django.urls import path
from django.http import HttpResponseRedirect

def redirect_to_new_log(request):
    """重定向到新的日志系统"""
    return HttpResponseRedirect('/log/')

urlpatterns = [
    # 所有旧路径都重定向到新日志系统
    path('', redirect_to_new_log, name='audit_dashboard'),
]