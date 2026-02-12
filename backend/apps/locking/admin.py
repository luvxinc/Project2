# File: backend/apps/locking/admin.py
"""
# ==============================================================================
# 模块名称: 分布式锁管理 (Locking Admin)
# ==============================================================================
#
# [Purpose / 用途]
# 提供在 Django Admin 后台强制解锁的能力 (紧急运维)。
#
# ==============================================================================
"""

from django.contrib import admin
from .models import SystemLock


@admin.register(SystemLock)
class SystemLockAdmin(admin.ModelAdmin):
    list_display = ('resource_key', 'locked_by', 'locked_at', 'module_name')
    list_filter = ('module_name', 'locked_at')
    search_fields = ('resource_key', 'locked_by')

    # 禁用“添加”按钮，锁应该只能通过 API 或业务逻辑产生
    def has_add_permission(self, request):
        return True

    # 允许删除 (强制解锁)
    def has_delete_permission(self, request, obj=None):
        return True