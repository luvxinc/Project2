# File: backend/web_ui/urls.py
from django.urls import path, include
from django.shortcuts import redirect
from . import views
from .views import system

app_name = 'web_ui'


urlpatterns = [
    # --- 1. Core & Auth ---
    path('', views.dashboard_home, name='home'),
    path('dashboard/', views.dashboard_home, name='dashboard_alias'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),

    # --- 2. New Hub-Based Modules ---
    path('dashboard/sales/', include('backend.apps.sales.urls')),
    path('dashboard/purchase/', include('backend.apps.purchase.urls')),
    path('dashboard/inventory/', include('backend.apps.inventory.urls')),
    path('dashboard/finance/', include('backend.apps.finance.urls')),
    path('dashboard/products/', include('backend.apps.products.urls')),
    
    # --- 3. Existing Modules (Unchanged) ---
    path('dashboard/user_admin/', include('backend.apps.user_admin.urls')),
    path('dashboard/audit/', include('backend.apps.audit.urls')),
    path('dashboard/db_admin/', include('backend.apps.db_admin.urls')),
    
    # --- 3.5. New Log System ---
    path('dashboard/log/', lambda r: redirect('/log/', permanent=False)),
    path('dashboard/log', lambda r: redirect('/log/', permanent=False)),
    
    # --- 4. Legacy Routes (Keep for backward compatibility) ---
    # path('dashboard/etl/', include('backend.apps.etl.urls')),
    # path('dashboard/reports/', include('backend.apps.reports.urls')),  # [Moved to Sales]
    # path('dashboard/visuals/', include('backend.apps.visuals.urls')),  # [Moved to Sales]

    # --- 5. System API ---
    path('api/sys/log_error/', system.log_client_error, name='log_client_error'),
    path('api/sys/task_progress/', system.get_task_progress, name='get_task_progress'),
    path('api/sys/user_env/', system.get_user_environment, name='get_user_env'),
    path('api/sys/security_requirements/', system.get_security_requirements, name='get_security_req'),
]