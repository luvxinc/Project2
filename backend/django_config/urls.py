# File: backend/erp_core/urls.py
"""
文件说明: 后端路由总入口 (Root URL Configuration) - V2.0 UI Integrated
修改记录:
1. [Add] 引入 'web_ui.urls'，接管根路径 ('') 和仪表盘路径。
2. [Keep] 保留所有 API 接口，确保后端逻辑核心不动。
"""

from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse

# 引入旧系统配置 (验证路径注入是否成功)
try:
    from backend.common.settings import settings
    legacy_version = settings.APP_VERSION
except ImportError:
    legacy_version = "Unknown (Import Failed)"


def health_check(request):
    """
    [API] 系统心跳检测
    用于验证 Django 是否成功启动，且能否读取旧系统的配置。
    """
    return JsonResponse({
        "status": "online",
        "system": "Eaglestar ERP Backend",
        "architecture": "Django Native (Phase 1 UI)",
        "legacy_core_version": legacy_version,
        "api_version": "v1",
        "timezone": "America/Los_Angeles"
    })

urlpatterns = [
    # --- 1. 系统管理 ---
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='api_health'),

    # --- 2. 业务 API (Headless Core) ---
    # --- 2. 业务 API (Headless Core) ---
    path('api/sys/', include('backend.apps.sys_config.urls')),
    # path('api/inventory/', include('backend.apps.inventory.urls')),  # [Disabled]
    path('api/lock/', include('backend.apps.locking.urls')),
    # path('api/etl/', include('backend.apps.etl.urls')),  # [Disabled]
    # path('api/reports/', include('backend.apps.reports.urls')),  # [Disabled]

    # --- 3. 日志系统 (Log System V2.0) ---
    path('log/', include('apps.log.urls', namespace='log')),

    # --- 4. eBay API 集成 (独立于 ETL) ---
    path('ebay/', include('backend.apps.ebay.urls', namespace='ebay')),

    # --- 5. 国际化语言切换 ---
    path('i18n/', include('django.conf.urls.i18n')),

    # --- 5. 前端界面 (Web UI) ---
    # [关键] 将根路径分发给 web_ui 处理
    # 注意：这行通常放在最后，以免覆盖特定 API 路径
    path('', include('web_ui.urls')),
]