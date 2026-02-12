"""
销售板块路由配置
Structure: /dashboard/sales/{submodule}/
"""
from django.urls import path, include
from . import views

app_name = 'sales'

urlpatterns = [
    # Module Hub
    path('', views.sales_hub, name='hub'),

    # Sub-pages (子路由页面)
    path('upload/', views.upload_page, name='upload'),
    path('report_builder/', views.report_builder_page, name='report_builder'),
    path('report_center/', views.report_center_page, name='report_center'),
    path('visualization/', views.visualization_page, name='visualization'),

    # Submodules
    # 1. Transactions (ETL)
    path('transactions/', include('backend.apps.etl.urls', namespace='transactions')),
    
    # 2. Reports (Reports App)
    path('reports/', include('backend.apps.reports.urls', namespace='reports')),
    
    # 3. Visuals (Visuals App)
    path('visuals/', include('backend.apps.visuals.urls', namespace='visuals')),
]

