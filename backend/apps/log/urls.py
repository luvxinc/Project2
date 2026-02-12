# File: backend/apps/log/urls.py
"""
日志系统 URL 路由
"""
from django.urls import path
from . import views

app_name = 'log'

urlpatterns = [
    # 主页
    path('', views.log_dashboard, name='dashboard'),
    
    # Tab 内容
    path('tab/overview/', views.log_tab_overview, name='tab_overview'),
    path('tab/error/', views.log_tab_error, name='tab_error'),
    path('tab/audit/', views.log_tab_audit, name='tab_audit'),
    path('tab/business/', views.log_tab_business, name='tab_business'),
    path('tab/access/', views.log_tab_access, name='tab_access'),
    path('tab/maintenance/', views.log_tab_maintenance, name='tab_maintenance'),
    
    # API - 错误管理
    path('api/error/<int:error_id>/', views.api_error_detail, name='api_error_detail'),
    path('api/error/<int:error_id>/resolve/', views.api_resolve_error, name='api_resolve_error'),
    
    # API - 安全模式控制
    path('api/mode/status/', views.api_get_mode_status, name='api_mode_status'),
    path('api/mode/god/unlock/', views.api_unlock_god_mode, name='api_unlock_god_mode'),
    path('api/mode/god/lock/', views.api_lock_god_mode, name='api_lock_god_mode'),
    path('api/mode/dev/toggle/', views.api_toggle_dev_mode, name='api_toggle_dev_mode'),
    
    # API - 日志维护
    path('api/dev/clear/', views.api_clear_dev_logs, name='api_clear_dev_logs'),
]

