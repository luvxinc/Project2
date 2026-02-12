# File: backend/apps/audit/admin.py
"""
# ==============================================================================
# 模块名称: 审计日志后台管理 (Audit Admin)
# ==============================================================================
#
# [Purpose / 用途]
# 将 AuditLog 注册到 Django Admin 后台，提供可视化的查询与检视功能。
#
# [ISO Compliance / 合规性]
# - 可追溯性: 在系统崩溃或前端服务不可用时，提供兜底的日志查询通道。
#
# ==============================================================================
"""
from django.contrib import admin
from .models import AuditLog

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'actor', 'action', 'target_model', 'status')
    list_filter = ('action', 'status', 'timestamp')
    search_fields = ('actor', 'action', 'details')
