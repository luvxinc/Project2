# File Path: backend/apps/reports/urls.py
"""
文件说明: 报表模块路由
"""
from django.urls import path
from . import views

app_name = 'reports'

urlpatterns = [
    # --- Web Views (Dashboard) ---
    path('', views.dashboard_view, name='dashboard'),
    
    # --- Generator ---
    path('generator/form/', views.generator_form, name='generator_form'),
    path('generator/start/', views.start_generation, name='start_generation'),
    
    # --- Center ---
    path('center/files/', views.center_files, name='center_files'),
    path('center/download/<str:filename>/', views.download_file, name='download'),
    path('center/download_zip/', views.download_zip, name='download_zip'),
    path('center/preview/<str:filename>/', views.preview_file, name='preview'),
    path('center/clear/', views.clear_files, name='clear_files'),
    
    # --- File Viewers (按类型拆分) ---
    path('center/view/table/<str:filename>/', views.viewer_table, name='viewer_table'),
    path('center/view/pdf/<str:filename>/', views.viewer_pdf, name='viewer_pdf'),
    path('center/view/image/<str:filename>/', views.viewer_image, name='viewer_image'),
    
    # --- API (REST) ---
    path('api/profit/', views.generate_profit_report, name='api_generate_profit'),
]