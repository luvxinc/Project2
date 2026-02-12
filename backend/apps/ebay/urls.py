# File: backend/apps/ebay/urls.py
"""
eBay Integration URL Routes
"""
from django.urls import path
from . import views
from . import api

app_name = 'ebay'

urlpatterns = [
    # === Web 页面 ===
    path('', views.dashboard, name='dashboard'),
    path('authorize/', views.authorize, name='authorize'),
    path('callback/', views.oauth_callback, name='callback'),
    path('disconnect/<int:account_id>/', views.disconnect_account, name='disconnect_account'),
    path('sync/', views.sync_page, name='sync'),
    
    # === REST API ===
    path('api/status/', api.get_status, name='api_status'),
    path('api/auth-url/', api.get_auth_url, name='api_auth_url'),
    path('api/disconnect/', api.disconnect, name='api_disconnect'),
    path('api/exchange-code/', api.exchange_code, name='api_exchange_code'),
    path('api/sync/orders/', api.sync_orders, name='api_sync_orders'),
    path('api/sync/finances/', api.sync_finances, name='api_sync_finances'),
    path('api/sync/all/', api.sync_all, name='api_sync_all'),
]
