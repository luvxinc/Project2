"""
库存板块路由配置
Structure: /dashboard/inventory/{submodule}/
"""
from django.urls import path, include
from . import views
from .views.dynamic_inv import dynamic_inv_page, dynamic_inv_api
from .views.shelf import shelf_page, shelf_list_api, shelf_create_api, shelf_delete_api
from .views.shelf_pdf import shelf_download_barcode, shelf_download_all

app_name = 'inventory'

urlpatterns = [
    # Module Hub
    path('', views.inventory_hub, name='hub'),
    
    # Sub-Pages (子路由页面)
    path('upload/', views.inventory_upload_page, name='upload'),
    path('edit/', views.inventory_edit_page, name='edit'),
    
    # Dynamic Inventory Management (动态库存管理)
    path('dynamic_inv/', dynamic_inv_page, name='dynamic_inv'),
    path('dynamic_inv/api/', dynamic_inv_api, name='dynamic_inv_api'),
    
    # Shelf Management (仓库货架码管理)
    path('shelf/', shelf_page, name='shelf'),
    path('shelf/api/list/', shelf_list_api, name='shelf_list_api'),
    path('shelf/api/create/', shelf_create_api, name='shelf_create_api'),
    path('shelf/api/delete/', shelf_delete_api, name='shelf_delete_api'),
    path('shelf/api/download_barcode/', shelf_download_barcode, name='shelf_download_barcode'),
    path('shelf/api/download_all/', shelf_download_all, name='shelf_download_all'),

    # Submodule: Stocktake (delegated to ETL app)
    # Namespace becomes: web_ui:inventory:stocktake_etl:xxx
    path('stocktake/', include('backend.apps.etl.urls', namespace='stocktake_etl')),

    # Submodule: Stocktake Modify (delegated to DB Admin app)
    # Namespace becomes: web_ui:inventory:stocktake_modify:xxx
    path('stocktake/modify/', include('backend.apps.db_admin.urls', namespace='stocktake_modify')),
]