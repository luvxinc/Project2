# File: backend/apps/etl/urls.py
"""
ETL 数据集成模块路由配置
"""
from django.urls import path
from . import views

app_name = 'etl'

urlpatterns = [
    # Hub 页面
    path('', views.etl_hub, name='hub'),
    
    # Tab 内容加载
    path('tab/transaction/', views.tab_transaction, name='tab_transaction'),
    path('tab/inventory/', views.tab_inventory, name='tab_inventory'),
    
    # Transaction Wizard 操作
    path('upload/', views.etl_upload, name='upload'),
    path('parse/', views.etl_parse, name='parse'),
    path('fix-sku/', views.etl_fix_sku, name='fix_sku'),
    path('transform/', views.etl_transform, name='transform'),
    path('cancel/', views.etl_cancel, name='cancel'),
    path('confirm/', views.etl_confirm, name='confirm'),  # 最终确认入库
    path('task-status/', views.etl_task_status, name='task_status'),  # [V2.3] 异步任务状态
    
    # Inventory Wizard 操作
    path('inv/validate/', views.inv_validate, name='inv_validate'),
    path('inv/sync/', views.inv_sync, name='inv_sync'),
    path('inv/check-date/', views.inv_check_date, name='inv_check_date'),
    path('inv/apply-corrections/', views.inv_apply_corrections, name='inv_apply_corrections'),
]