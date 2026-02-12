# File: backend/apps/products/urls.py
"""
产品板块路由配置
子路由结构：
- /dashboard/products/            # Hub 入口（纯导航页）
- /dashboard/products/data/       # 产品数据维护
- /dashboard/products/add/        # 新增产品
- /dashboard/products/barcode/    # 外包装条形码
"""
from django.urls import path
from . import views
from . import actions

app_name = 'products'

urlpatterns = [
    # Hub 入口
    path('', views.products_hub, name='hub'),
    
    # 子路由页面
    path('data/', views.product_data, name='product_data'),
    path('add/', views.product_add, name='product_add'),
    path('barcode/', views.product_barcode, name='product_barcode'),
    
    # API 端点
    path('api/sku-list/', actions.sku_list_api, name='sku_list_api'),
    
    # Actions
    path('barcode/generate/', actions.generate_barcode, name='generate_barcode'),
    path('barcode/download/<path:filename>', actions.download_barcode, name='download_barcode'),
    path('barcode/download-all/', actions.download_all_barcodes, name='download_all_barcodes'),
    path('barcode/clear/', actions.clear_barcodes, name='clear_barcodes'),
    path('barcode/view/<path:filename>', actions.view_barcode, name='view_barcode'),
]
