# File: backend/apps/locking/urls.py
"""
# ==============================================================================
# 模块名称: 分布式锁路由 (Locking URLs)
# ==============================================================================
#
# [Purpose / 用途]
# 定义锁服务的 API 路由。
#
# ==============================================================================
"""

from django.urls import path
from .views import acquire_lock, release_lock, check_lock

urlpatterns = [
    # 抢锁 (需鉴权)
    path('acquire/', acquire_lock, name='lock_acquire'),

    # 释放锁 (需鉴权)
    path('release/', release_lock, name='lock_release'),

    # 检查锁状态 (公开/只读)
    # 例如: /api/lock/check/Data_Transaction/
    path('check/<str:key>/', check_lock, name='lock_check'),
]